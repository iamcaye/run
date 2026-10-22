import { WORKOUT_ESTIMATE as E } from "@/config/training";
import type { PaceZone, RecoveryKind, StepTarget, StructureStep } from "@/lib/planning/types";

type Est = { km: number; seconds: number };

function targetPace(t: StepTarget): number {
  switch (t.kind) {
    case "pace":
      return t.secPerKm;
    case "hr_zone":
      return E.secPerKmByZone[t.zone];
    case "rpe":
      return E.secPerKmByRpe[Math.min(Math.max(t.rpe, 1), 10) - 1]!;
  }
}

/** Legacy generated-step zone to pace: hard zones map to the nearest HR-zone pace. */
function legacyZonePace(zone: PaceZone): number {
  switch (zone) {
    case "easy":
    case "long":
      return E.easySecPerKm;
    case "tempo":
      return E.secPerKmByZone[4];
    case "race_pace":
      return E.secPerKmByZone[3];
    case "intervals":
      return E.untargetedRepSecPerKm;
  }
}

type Intensity = { target?: StepTarget; paceSecPerKm?: number; zone?: PaceZone };

function paceOf(s: Intensity, fallback: number, isRep: boolean): number {
  if (s.target) return targetPace(s.target);
  if (s.paceSecPerKm) return s.paceSecPerKm;
  if (s.zone) return isRep ? E.untargetedRepSecPerKm : legacyZonePace(s.zone);
  return fallback;
}

function block(km: number | undefined, seconds: number | undefined, pace: number): Est {
  if (km !== undefined) return { km, seconds: km * pace };
  if (seconds !== undefined) return { km: seconds / pace, seconds };
  return { km: 0, seconds: 0 };
}

function recovery(
  kind: RecoveryKind,
  km: number | undefined,
  seconds: number | undefined,
): Est {
  const pace = E.recoverySecPerKm[kind];
  if (pace === null) return { km: 0, seconds: seconds ?? 0 };
  return block(km, seconds, pace);
}

/** Estimated distance (km) and duration (s) of a workout, using the paces in WORKOUT_ESTIMATE. */
export function estimateWorkout(steps: readonly StructureStep[]): Est {
  let km = 0;
  let seconds = 0;
  const add = (e: Est, times = 1) => {
    km += e.km * times;
    seconds += e.seconds * times;
  };
  for (const s of steps) {
    switch (s.kind) {
      case "warmup":
      case "cooldown":
        add(block(s.km, s.seconds, s.target ? targetPace(s.target) : E.easySecPerKm));
        break;
      case "steady":
        add(block(s.km, s.seconds, paceOf(s, E.easySecPerKm, false)));
        break;
      case "reps": {
        add(block(s.repKm, s.repSeconds, paceOf(s, E.untargetedRepSecPerKm, true)), s.reps);
        if (s.recoverySeconds !== undefined || s.recoveryKm !== undefined) {
          add(recovery(s.recoveryKind ?? "jog", s.recoveryKm, s.recoverySeconds), Math.max(s.reps - 1, 0));
        }
        break;
      }
    }
  }
  return { km, seconds };
}
