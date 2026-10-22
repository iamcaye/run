import type { StepTarget, StructureStep } from "./types";

export type Segment = { weight: number; work: boolean };

// Rough distance equivalents so time-based reps and recoveries get a sensible width.
const REP_SEC_PER_KM = 240;
const RECOVERY_SEC_PER_KM = 360;

const WORK_HR_ZONE = 3;
const WORK_RPE = 6;

function blockWeight(step: { km?: number; seconds?: number }): number {
  return step.km ?? (step.seconds ?? 0) / RECOVERY_SEC_PER_KM;
}

function recoveryWeight(step: { recoveryKm?: number; recoverySeconds?: number }): number {
  return step.recoveryKm ?? (step.recoverySeconds ?? 0) / RECOVERY_SEC_PER_KM;
}

function targetIsWork(target: StepTarget): boolean {
  switch (target.kind) {
    case "pace":
      return true;
    case "hr_zone":
      return target.zone >= WORK_HR_ZONE;
    case "rpe":
      return target.rpe >= WORK_RPE;
  }
}

/** Session steps as proportional blocks: easy parts low, work parts tall. */
export function structureSegments(steps: readonly StructureStep[]): Segment[] {
  const out: Segment[] = [];
  for (const step of steps) {
    switch (step.kind) {
      case "warmup":
      case "cooldown":
        out.push({ weight: blockWeight(step), work: false });
        break;
      case "steady": {
        const zoneWork = step.zone !== "easy" && step.zone !== "long";
        // An explicit target decides on its own unless a pace zone says otherwise.
        const work = step.target ? targetIsWork(step.target) || (step.zone !== undefined && zoneWork) : zoneWork;
        out.push({ weight: blockWeight(step), work });
        break;
      }
      case "reps": {
        const rep = step.repKm ?? (step.repSeconds ?? 0) / REP_SEC_PER_KM;
        for (let i = 0; i < step.reps; i++) {
          out.push({ weight: rep, work: true });
          if (i < step.reps - 1) out.push({ weight: recoveryWeight(step), work: false });
        }
        break;
      }
    }
  }
  return out.filter((s) => s.weight > 0);
}
