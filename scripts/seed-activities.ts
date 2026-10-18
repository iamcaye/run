/**
 * Builds realistic Health Auto Export payloads for a demo user's past planned sessions and sends
 * them through the real import pipeline (so seeded data exercises the same code as production).
 */
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import type { PlannedSession } from "@/server/dal";

/** Small deterministic PRNG so seeds are reproducible. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const haeDate = (d: Date, tz: string) => format(new TZDate(d, tz), "yyyy-MM-dd HH:mm:ss xx");

export function demoWorkouts(input: {
  sessions: readonly PlannedSession[];
  today: string;
  timeZone: string;
  center: { lat: number; lon: number };
  /** Fallback pace for effort-only plans (s/km). */
  easyPace: number;
  seed: number;
  /** Share of past sessions actually run. */
  completion: number;
}) {
  const rand = rng(input.seed);
  const workouts: Record<string, unknown>[] = [];

  for (const s of input.sessions) {
    if (s.date >= input.today || s.type === "rest" || s.type === "race") continue;
    if (rand() > input.completion) continue; // missed

    const km = Math.max(2, s.targetKm * (0.92 + rand() * 0.16));
    const pace = (s.targetPaceSecPerKm ?? input.easyPace) * (0.97 + rand() * 0.07);
    const seconds = Math.round(km * pace);
    const hour = s.type === "long" ? 8 : 19;
    const start = new TZDate(`${s.date}T${String(hour).padStart(2, "0")}:${String(Math.floor(rand() * 50)).padStart(2, "0")}:00`, input.timeZone);
    const end = new Date(start.getTime() + seconds * 1000);
    const hard = ["tempo", "intervals", "race_pace"].includes(s.type);
    const avgHr = Math.round((hard ? 158 : 142) + rand() * 8);

    // A loop around the city centre: one point every ~100 m.
    const points = Math.max(8, Math.round(km * 10));
    const radiusDeg = (km / (2 * Math.PI)) / 111;
    const route = Array.from({ length: points }, (_, i) => {
      const angle = (2 * Math.PI * i) / points;
      return {
        lat: input.center.lat + radiusDeg * Math.sin(angle),
        lon: input.center.lon + (radiusDeg * Math.cos(angle)) / Math.cos((input.center.lat * Math.PI) / 180),
        altitude: 20 + 5 * Math.sin(angle * 3),
        timestamp: haeDate(new Date(start.getTime() + (seconds * 1000 * i) / points), input.timeZone),
      };
    });
    const heartRateData = Array.from({ length: Math.ceil(seconds / 60) }, (_, m) => ({
      date: haeDate(new Date(start.getTime() + m * 60_000), input.timeZone),
      Avg: Math.round(Math.min(avgHr + 15, 105 + (avgHr - 105) * Math.min(1, m / 8) + (rand() - 0.5) * 6)),
      units: "count/min",
    }));

    workouts.push({
      id: `demo-${s.id}`,
      name: "Outdoor Run",
      start: haeDate(start, input.timeZone),
      end: haeDate(end, input.timeZone),
      duration: seconds,
      distance: { qty: Math.round(km * 100) / 100, units: "km" },
      avgHeartRate: { qty: avgHr, units: "bpm" },
      maxHeartRate: { qty: avgHr + 14, units: "bpm" },
      heartRateData,
      route,
    });
  }
  return workouts;
}
