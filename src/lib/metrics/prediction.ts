import { METRICS } from "@/config/training";
import { riegelTime } from "@/lib/planning/steps/paces";
import { addDays, type LocalDate } from "@/lib/time";
import { hrrFraction } from "./load";
import type { HrSettings, MetricActivity } from "./types";

export type RacePrediction = {
  predictedSeconds: number;
  fromActivityId: string;
  fromKm: number;
  fromSeconds: number;
  fromDate: LocalDate;
  /** "hard": from a hard effort. "any": no hard effort available — likely conservative. */
  basis: "hard" | "any";
};

/** Hard effort: linked to a quality/race session, logged RPE ≥ 7, or average HR ≥ 80% of reserve. */
export function isHardEffort(a: MetricActivity, sessionType: string | null, hr: HrSettings): boolean {
  if (sessionType === "tempo" || sessionType === "intervals" || sessionType === "race_pace" || sessionType === "race") return true;
  if (a.rpe !== null && a.rpe >= METRICS.prediction.hardRpe) return true;
  const hrr = a.avgHr !== null ? hrrFraction(a.avgHr, hr) : null;
  return hrr !== null && hrr >= METRICS.prediction.hardHrr;
}

/**
 * Goal-distance prediction via Riegel from the best comparable effort in the lookback window:
 * runs of at least max(minKm, minFractionOfGoal × goal distance), preferring hard efforts
 * (an easy run predicts your easy pace, not your race). The fastest prediction wins.
 */
export function predictRace(input: {
  activities: readonly MetricActivity[];
  goalKm: number;
  asOf: LocalDate;
  sessionTypeOf?: (activity: MetricActivity) => string | null;
  hr?: HrSettings;
}): RacePrediction | null {
  const { activities, goalKm, asOf } = input;
  const sessionTypeOf = input.sessionTypeOf ?? (() => null);
  const hr = input.hr ?? { maxHr: null, restHr: null };
  const since = addDays(asOf, -METRICS.predictionLookbackWeeks * 7);
  const minKm = Math.max(METRICS.prediction.minKm, METRICS.prediction.minFractionOfGoal * goalKm);

  const comparable = activities.filter((a) => a.localDate >= since && a.localDate <= asOf && a.km >= minKm && a.seconds > 0);
  const hard = comparable.filter((a) => isHardEffort(a, sessionTypeOf(a), hr));
  const pool = hard.length > 0 ? hard : comparable;
  const basis = hard.length > 0 ? "hard" : "any";

  let best: RacePrediction | null = null;
  for (const a of pool) {
    const predicted = riegelTime(a.seconds, a.km, goalKm);
    if (!best || predicted < best.predictedSeconds) {
      best = { predictedSeconds: Math.round(predicted), fromActivityId: a.id, fromKm: a.km, fromSeconds: a.seconds, fromDate: a.localDate, basis };
    }
  }
  return best;
}
