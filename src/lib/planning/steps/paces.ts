import { PACES, type SessionType } from "@/config/training";
import { daysBetween, type LocalDate } from "@/lib/time";
import type { PlanGoal, PlanWarning, RecentActivity } from "../types";

/** Riegel: T2 = T1 × (D2/D1)^k. */
export function riegelTime(t1Seconds: number, d1Km: number, d2Km: number): number {
  return t1Seconds * (d2Km / d1Km) ** PACES.riegelExponent;
}

/** Seconds per km at distance `dKm`, for an athlete who runs `refKm` in `refSeconds`. */
export function equivalentPace(refSeconds: number, refKm: number, dKm: number): number {
  return riegelTime(refSeconds, refKm, dKm) / dKm;
}

export type PaceTable = Readonly<Record<SessionType, number | null>>;

const mid = ([a, b]: readonly [number, number]) => (a + b) / 2;

export function paceTableFromRaceTime(raceSeconds: number, raceKm: number): PaceTable {
  const rp = raceSeconds / raceKm;
  const [tempoA, tempoB] = PACES.tempoEquivalentKm;
  const tempo = (equivalentPace(raceSeconds, raceKm, tempoA) + equivalentPace(raceSeconds, raceKm, tempoB)) / 2;
  const easy = rp + mid(PACES.easyOffsetSecPerKm);
  return {
    easy,
    long: rp + mid(PACES.longOffsetSecPerKm),
    tempo,
    intervals: equivalentPace(raceSeconds, raceKm, PACES.intervalsEquivalentKm),
    race_pace: rp,
    strides: easy,
    race: rp,
    rest: null,
  };
}

/**
 * Paces for the plan. Target-time goals derive from the target. Finish goals estimate a race time
 * from the best recent run (Riegel); with no usable runs, sessions are effort-only (RPE).
 */
export function derivePaces(input: {
  goal: PlanGoal;
  recentActivities: readonly RecentActivity[];
  today: LocalDate;
}): { paces: PaceTable | null; warnings: PlanWarning[] } {
  const { goal, recentActivities, today } = input;
  if (goal.goalType === "target_time" && goal.targetTimeSeconds) {
    return { paces: paceTableFromRaceTime(goal.targetTimeSeconds, goal.distanceKm), warnings: [] };
  }

  const { minKm, lookbackDays } = PACES.estimateFromActivities;
  let best: { predicted: number; km: number } | null = null;
  for (const a of recentActivities) {
    const age = daysBetween(a.date, today);
    if (a.km < minKm || a.seconds <= 0 || age < 0 || age > lookbackDays) continue;
    const predicted = riegelTime(a.seconds, a.km, goal.distanceKm);
    if (!best || predicted < best.predicted) best = { predicted, km: a.km };
  }
  if (!best) return { paces: null, warnings: [{ code: "no_paces" }] };
  return {
    paces: paceTableFromRaceTime(best.predicted, goal.distanceKm),
    warnings: [{ code: "paces_estimated", fromKm: best.km }],
  };
}
