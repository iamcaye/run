import { createHash } from "node:crypto";
import { IMPORT } from "@/config/training";
import { parseHaeDate, readNumber, toKm } from "./parse";
import { HaeWorkoutSchema } from "./schema";
import type { HrSample } from "./types";

export type MappedRoutePoint = { lat: number; lon: number; altitude: number | null; timestamp: Date | null };

export type MappedWorkout = {
  externalId: string;
  name: string;
  startAt: Date;
  seconds: number;
  km: number;
  avgHr: number | null;
  maxHr: number | null;
  hrSeries: HrSample[] | null;
  route: MappedRoutePoint[];
};

export type MapResult =
  | { status: "ok"; workout: MappedWorkout }
  | { status: "skipped"; reason: "not_running"; name: string }
  | { status: "invalid"; reason: string };

const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : undefined);
const firstNum = (o: Record<string, unknown>, keys: readonly string[]) => {
  for (const k of keys) {
    const n = readNumber(o[k]);
    if (n !== null) return n;
  }
  return null;
};

/**
 * Maps one Health Auto Export workout to our activity shape. All knowledge of HAE field names
 * lives here, so a new export version only means adjusting this function (and its fixtures).
 */
export function mapWorkout(raw: unknown, ctx: { timeZone: string }): MapResult {
  const parsed = HaeWorkoutSchema.safeParse(raw);
  if (!parsed.success) return { status: "invalid", reason: "not an object" };
  const w = parsed.data;

  const name = str(w.name) ?? str(w.workoutActivityType) ?? "";
  if (!IMPORT.runningWorkoutPattern.test(name)) return { status: "skipped", reason: "not_running", name };

  const startAt = parseHaeDate(w.start ?? w.startDate, ctx.timeZone);
  if (!startAt) return { status: "invalid", reason: `unparseable start date in "${name}"` };
  const endAt = parseHaeDate(w.end ?? w.endDate, ctx.timeZone);

  // Prefer the explicit duration (excludes pauses); fall back to end − start.
  const duration = readNumber(w.duration);
  const seconds = Math.round(
    duration !== null && duration > 0 ? duration : endAt ? (endAt.getTime() - startAt.getTime()) / 1000 : 0,
  );
  if (seconds <= 0) return { status: "invalid", reason: `missing duration in "${name}"` };

  const distanceRaw = w.distance ?? w.totalDistance;
  const km =
    distanceRaw && typeof distanceRaw === "object"
      ? toKm((distanceRaw as Record<string, unknown>).qty, (distanceRaw as Record<string, unknown>).units)
      : toKm(distanceRaw, (w as Record<string, unknown>).distanceUnits);
  if (km === null) return { status: "invalid", reason: `missing or unknown distance in "${name}"` };

  const heartRate = (w.heartRate && typeof w.heartRate === "object" ? w.heartRate : {}) as Record<string, unknown>;
  const avgHr = readNumber(w.avgHeartRate, "avg", "Avg") ?? readNumber(heartRate.avg, "avg", "Avg");
  const maxHr = readNumber(w.maxHeartRate, "max", "Max") ?? readNumber(heartRate.max, "max", "Max");

  const hrSeries = (w.heartRateData ?? [])
    .map((sample) => {
      const at = parseHaeDate(sample.date ?? sample.timestamp, ctx.timeZone);
      const bpm = firstNum(sample, ["Avg", "avg", "qty", "value"]);
      return at && bpm !== null ? { t: Math.round((at.getTime() - startAt.getTime()) / 1000), bpm: Math.round(bpm) } : null;
    })
    .filter((s): s is HrSample => s !== null && s.t >= 0)
    .sort((a, b) => a.t - b.t);

  const route = (w.route ?? [])
    .map((p): MappedRoutePoint | null => {
      const lat = firstNum(p, ["lat", "latitude"]);
      const lon = firstNum(p, ["lon", "lng", "longitude"]);
      if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
      return {
        lat,
        lon,
        altitude: firstNum(p, ["altitude", "elevation"]),
        timestamp: parseHaeDate(p.timestamp ?? p.date, ctx.timeZone),
      };
    })
    .filter((p): p is MappedRoutePoint => p !== null);

  // Stable id even if an export version omits it, so re-sends stay idempotent.
  const externalId =
    str(w.id) ?? str(w.uuid) ?? `hae:${createHash("sha256").update(`${name}|${startAt.toISOString()}`).digest("hex").slice(0, 32)}`;

  return {
    status: "ok",
    workout: {
      externalId,
      name,
      startAt,
      seconds,
      km: Math.round(km * 1000) / 1000,
      avgHr: avgHr === null ? null : Math.round(avgHr),
      maxHr: maxHr === null ? null : Math.round(maxHr),
      hrSeries: hrSeries.length > 0 ? hrSeries : null,
      route,
    },
  };
}
