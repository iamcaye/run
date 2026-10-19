import type { StructureStep } from "./types";

export type Segment = { weight: number; work: boolean };

// Rough distance equivalents so time-based reps and recoveries get a sensible width.
const REP_SEC_PER_KM = 240;
const RECOVERY_SEC_PER_KM = 360;

/** Session steps as proportional blocks: easy parts low, work parts tall. */
export function structureSegments(steps: readonly StructureStep[]): Segment[] {
  const out: Segment[] = [];
  for (const step of steps) {
    switch (step.kind) {
      case "warmup":
      case "cooldown":
        out.push({ weight: step.km, work: false });
        break;
      case "steady":
        out.push({ weight: step.km, work: step.zone !== "easy" && step.zone !== "long" });
        break;
      case "reps": {
        const rep = step.repKm ?? (step.repSeconds ?? 0) / REP_SEC_PER_KM;
        for (let i = 0; i < step.reps; i++) {
          out.push({ weight: rep, work: true });
          if (i < step.reps - 1) out.push({ weight: step.recoverySeconds / RECOVERY_SEC_PER_KM, work: false });
        }
        break;
      }
    }
  }
  return out.filter((s) => s.weight > 0);
}
