import type { SessionType } from "@/config/training";
import type { StructureStep } from "@/lib/planning/types";
import type { IsoWeekday, LocalDate } from "@/lib/time";

export type WorkoutType = Exclude<SessionType, "rest">;

export type PlanWorkout = { name: string; type: WorkoutType; notes: string | null; steps: StructureStep[] };

/** `days` has length 7, index 0 = Monday. */
export type CustomPlanWeek = { id: string; days: (PlanWorkout | null)[] };

export type CustomPlanDoc = { weeks: CustomPlanWeek[] };

export type DaySlot = { week: number; day: IsoWeekday };

export type SessionDraft = {
  sourceKey: string;
  date: LocalDate;
  weekIndex: number;
  type: WorkoutType;
  targetKm: number;
  targetPaceSecPerKm: number | null;
  effortDescription: string;
  structure: { steps: StructureStep[] };
};
