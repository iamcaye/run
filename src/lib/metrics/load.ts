import { METRICS, type SessionType } from "@/config/training";
import type { HrSettings, MetricActivity } from "./types";

export type RpeSource = "logged" | "heart_rate" | "session_type" | "default";

/** Heart-rate reserve fraction (Karvonen), or null without HR settings. */
export function hrrFraction(bpm: number, hr: HrSettings): number | null {
  if (hr.maxHr === null || hr.restHr === null || hr.maxHr <= hr.restHr) return null;
  return (bpm - hr.restHr) / (hr.maxHr - hr.restHr);
}

/** Piecewise-linear RPE from heart-rate reserve, clamped to 1–10. */
export function rpeFromHrr(fraction: number): number {
  const pts = METRICS.rpeFromHrr;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return METRICS.defaultRpeUnplanned;
  if (fraction <= first[0]) return Math.max(1, first[1]);
  if (fraction >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i] as readonly [number, number];
    const [x0, y0] = pts[i - 1] as readonly [number, number];
    if (fraction <= x1) return y0 + ((fraction - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}

/**
 * RPE for load: the logged value; else estimated from average HR (with HR settings);
 * else the planned session type's default; else a generic default.
 */
export function effectiveRpe(
  activity: Pick<MetricActivity, "rpe" | "avgHr">,
  hr: HrSettings,
  sessionType: SessionType | null,
): { rpe: number; source: RpeSource } {
  if (activity.rpe !== null) return { rpe: activity.rpe, source: "logged" };
  const hrr = activity.avgHr !== null ? hrrFraction(activity.avgHr, hr) : null;
  if (hrr !== null) return { rpe: Math.round(rpeFromHrr(hrr) * 10) / 10, source: "heart_rate" };
  if (sessionType && sessionType !== "rest") return { rpe: METRICS.defaultRpeBySessionType[sessionType], source: "session_type" };
  return { rpe: METRICS.defaultRpeUnplanned, source: "default" };
}

/** Session RPE load = minutes × RPE. */
export function srpeLoad(seconds: number, rpe: number): number {
  return (seconds / 60) * rpe;
}
