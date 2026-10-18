import type { SessionType } from "@/config/training";

export type Phase = "base" | "build" | "specific" | "taper" | "race";

/** A block of a quality session, e.g. "6 × 800 m @ intervals pace, 90 s jog". */
export type StructureStep =
  | { kind: "warmup"; km: number }
  | { kind: "cooldown"; km: number }
  | {
      kind: "reps";
      reps: number;
      /** Either a distance or a duration per rep. */
      repKm?: number;
      repSeconds?: number;
      paceSecPerKm?: number;
      effort?: string;
      recoverySeconds: number;
    }
  | { kind: "steady"; km: number; paceSecPerKm?: number; effort?: string };

export type SessionStructure = { steps: StructureStep[] };

/** Fields of a planned session an adjustment may change. */
export type AdjustableSessionFields = {
  type: SessionType;
  targetKm: number;
  targetPaceSecPerKm: number | null;
  effortDescription: string | null;
  structure: SessionStructure | null;
};

/** One session change inside a plan adjustment; `before` is checked against the DB on accept. */
export type AdjustmentChange =
  | {
      op: "update";
      sessionId: string;
      before: AdjustableSessionFields;
      after: AdjustableSessionFields;
    }
  | { op: "delete"; sessionId: string; before: AdjustableSessionFields };
