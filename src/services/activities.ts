import "server-only";
import { randomUUID } from "node:crypto";
import { TZDate } from "@date-fns/tz";
import { computeSplits, hrZones, timeInZones, type HrZone, type Split } from "@/lib/metrics";
import type { ManualRun } from "@/lib/validation/activity";
import type { Activity, PlannedSession, RoutePoint, Settings, UserScope } from "@/server/dal";
import { linkToPlannedSession } from "./activity-linking";

export type ActivityDetail = {
  activity: Activity;
  route: Pick<RoutePoint, "lat" | "lon">[];
  splits: Split[];
  zones: HrZone[] | null;
  /** Seconds per zone; index 0 = below Z1. Null without HR samples or HR settings. */
  timeInZones: number[] | null;
  session: PlannedSession | null;
};

export async function getActivityDetail(scope: UserScope, id: string, settings: Settings): Promise<ActivityDetail | null> {
  const activity = await scope.activities.get(id);
  if (!activity) return null;
  const [points, session] = await Promise.all([
    scope.activities.routePoints(id),
    activity.plannedSessionId ? scope.sessions.get(activity.plannedSessionId) : Promise.resolve(null),
  ]);
  const zones = hrZones(settings);
  return {
    activity,
    route: points.map((p) => ({ lat: p.lat, lon: p.lon })),
    splits: computeSplits(points, { totalKm: activity.km }),
    zones,
    timeInZones: zones && activity.hrSeries?.length ? timeInZones(activity.hrSeries, activity.seconds, zones) : null,
    session,
  };
}

/** Logs a run the watch didn't capture and links it to that day's planned session. */
export async function logManualRun(scope: UserScope, run: ManualRun, settings: Settings): Promise<{ activity: Activity; linked: boolean }> {
  const [h, m] = run.time.split(":").map(Number);
  const [y, mo, d] = run.date.split("-").map(Number);
  const startAt = new Date(new TZDate(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 12, m ?? 0, 0, 0, settings.timezone).getTime());
  const activity = await scope.activities.upsert({
    externalId: `manual:${randomUUID()}`,
    source: "manual",
    startAt,
    km: run.km,
    seconds: run.seconds,
    avgHr: null,
    maxHr: null,
    rpe: run.rpe,
    hrSeries: null,
    plannedSessionId: null,
    rawImportId: null,
    notes: run.notes,
  });
  const linked = await linkToPlannedSession(scope, activity, settings.timezone);
  return { activity: (await scope.activities.get(activity.id)) ?? activity, linked };
}

/** Manual runs can be deleted; imported ones would just come back with the next sync. */
export async function deleteManualActivity(scope: UserScope, id: string): Promise<boolean> {
  const activity = await scope.activities.get(id);
  if (!activity || activity.source !== "manual") return false;
  return scope.activities.delete(id);
}
