import type { DistanceKey, Level, SessionType } from "@/config/training";
import type { IsoWeekday, LocalDate } from "@/lib/time";

export type Phase = "base" | "build" | "specific" | "taper" | "race";

export type PlanGoal = {
  raceDate: LocalDate;
  distanceKm: number;
  goalType: "finish" | "target_time";
  targetTimeSeconds: number | null;
  startWeeklyKm: number;
  level: Level;
};

export type PlanSettings = {
  weekStart: IsoWeekday;
  runDays: readonly IsoWeekday[];
  longRunDay: IsoWeekday;
  maxRunsPerWeek: number;
};

/** A completed run, used to estimate paces for finish goals. */
export type RecentActivity = { date: LocalDate; km: number; seconds: number };

/** A stored session as the generator sees it during regeneration. */
export type ExistingSession = {
  id: string;
  date: LocalDate;
  type: SessionType;
  targetKm: number;
  isUserEdited: boolean;
  /** Linked to a completed activity. */
  hasActivity: boolean;
};

/** Past, user-edited and completed sessions are never changed by regeneration or adaptation. */
export function isFrozen(s: ExistingSession, today: LocalDate): boolean {
  return s.date < today || s.isUserEdited || s.hasActivity;
}

export type PlannedSessionDraft = {
  date: LocalDate;
  weekIndex: number;
  phase: Phase;
  type: SessionType;
  targetKm: number;
  targetPaceSecPerKm: number | null;
  effortDescription: string;
  structure: SessionStructure | null;
};

export type PlanWeek = {
  index: number;
  start: LocalDate;
  /** Dates in this week the plan may use (≥ startDate, ≤ raceDate). */
  days: LocalDate[];
  phase: Phase;
  /** Leading maintenance block for long lead times. */
  isMaintenance: boolean;
  isDeload: boolean;
  /** First week starting mid-week. */
  isPartial: boolean;
  /** Full-week volume target from the curve (km). */
  targetKm: number;
};

export type PlanWarning =
  | { code: "compressed"; weeks: number; recommendedWeeks: number }
  | { code: "race_not_in_future" }
  | { code: "peak_clamped"; peakKm: number; tablePeakKm: number }
  | { code: "paces_estimated"; fromKm: number }
  | { code: "no_paces" }
  | { code: "quality_dropped"; weekIndex: number }
  | { code: "long_run_moved"; weekIndex: number };

export type PlanResult = {
  sessions: PlannedSessionDraft[];
  weeks: PlanWeek[];
  warnings: PlanWarning[];
  distanceKey: DistanceKey;
  peakKm: number;
};

/** Types counted as "hard days" for spacing rules (the long run is handled separately). */
export const HARD_TYPES: ReadonlySet<SessionType> = new Set(["tempo", "intervals", "race_pace", "race"]);

/** Pace zone a step runs at; resolved to `paceSecPerKm` when the goal has paces. */
export type PaceZone = "easy" | "long" | "tempo" | "intervals" | "race_pace";

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
      zone?: PaceZone;
      paceSecPerKm?: number;
      effort?: string;
      recoverySeconds: number;
    }
  | { kind: "steady"; km: number; zone?: PaceZone; paceSecPerKm?: number; effort?: string };

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
