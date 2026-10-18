import type { LocalDate } from "@/lib/time";

export type GoalStatus = "upcoming" | "active" | "completed" | "abandoned";

type GoalLike = { status: GoalStatus; raceDate: LocalDate };

/** Finished goals stay in history; anything else can become the active goal. */
export function canActivate(goal: GoalLike): boolean {
  return goal.status === "upcoming" || goal.status === "abandoned";
}

/** A result can be logged from race day onwards, unless one was already logged. */
export function canLogResult(goal: GoalLike, today: LocalDate): boolean {
  return goal.status !== "completed" && goal.raceDate <= today;
}

export function canAbandon(goal: GoalLike): boolean {
  return goal.status === "active" || goal.status === "upcoming";
}

/** After race day, nudge the user to log the official result. */
export function needsResultPrompt(goal: GoalLike, today: LocalDate): boolean {
  return (goal.status === "active" || goal.status === "upcoming") && goal.raceDate < today;
}

export type GoalPlanFields = {
  raceDate: LocalDate;
  distanceKm: number;
  goalType: "finish" | "target_time";
  targetTimeSeconds: number | null;
  startWeeklyKm: number;
  level: "beginner" | "intermediate" | "advanced";
};

const GOAL_PLAN_KEYS = [
  "raceDate",
  "distanceKm",
  "goalType",
  "targetTimeSeconds",
  "startWeeklyKm",
  "level",
] as const satisfies readonly (keyof GoalPlanFields)[];

/** Goal fields whose change should offer to regenerate future sessions. */
export function goalChangesAffectingPlan(
  before: GoalPlanFields,
  after: GoalPlanFields,
): (keyof GoalPlanFields)[] {
  return GOAL_PLAN_KEYS.filter((k) => before[k] !== after[k]);
}

export type AvailabilityFields = {
  weekStart: number;
  runDays: readonly number[];
  longRunDay: number;
  maxRunsPerWeek: number;
};

/** Availability changes also offer regeneration of the active goal's future sessions. */
export function availabilityChanged(before: AvailabilityFields, after: AvailabilityFields): boolean {
  const days = (d: readonly number[]) => [...d].sort((a, b) => a - b).join(",");
  return (
    before.weekStart !== after.weekStart ||
    before.longRunDay !== after.longRunDay ||
    before.maxRunsPerWeek !== after.maxRunsPerWeek ||
    days(before.runDays) !== days(after.runDays)
  );
}
