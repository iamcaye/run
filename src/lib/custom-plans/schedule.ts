import { EFFORT_DESCRIPTIONS } from "@/config/training";
import { addDays, daysBetween, startOfWeek, type IsoWeekday, type LocalDate } from "@/lib/time";
import { estimateWorkout } from "./estimate";
import type { CustomPlanDoc, DaySlot, PlanWorkout, SessionDraft } from "./types";

export const sourceKeyOf = (weekId: string, day: IsoWeekday): string => `${weekId}:${day}`;

type Scheduled = DaySlot & { date: LocalDate; sourceKey: string; workout: PlanWorkout };

/** Plan weeks are Mon–Sun, starting from the Monday of the start date's week. */
export function scheduleWorkouts(doc: CustomPlanDoc, startDate: LocalDate): Scheduled[] {
  const monday = startOfWeek(startDate, 1);
  const out: Scheduled[] = [];
  doc.weeks.forEach((week, w) => {
    week.days.forEach((workout, i) => {
      if (!workout) return;
      const day = (i + 1) as IsoWeekday;
      const date = addDays(monday, w * 7 + i);
      if (date < startDate) return;
      out.push({ week: w, day, date, sourceKey: sourceKeyOf(week.id, day), workout });
    });
  });
  return out;
}

export function toSessionDrafts(doc: CustomPlanDoc, startDate: LocalDate): SessionDraft[] {
  return scheduleWorkouts(doc, startDate).map(({ week, date, sourceKey, workout }) => {
    const paced = workout.steps.find(
      (s) => (s.kind === "reps" || s.kind === "steady") && s.target?.kind === "pace",
    );
    const target = paced && (paced.kind === "reps" || paced.kind === "steady") ? paced.target : undefined;
    return {
      sourceKey,
      date,
      weekIndex: week,
      type: workout.type,
      targetKm: Math.round(estimateWorkout(workout.steps).km * 10) / 10,
      targetPaceSecPerKm: target?.kind === "pace" ? target.secPerKm : null,
      effortDescription: workout.notes ?? EFFORT_DESCRIPTIONS[workout.type],
      structure: { steps: workout.steps },
    };
  });
}

export function planEndDate(doc: CustomPlanDoc, startDate: LocalDate): LocalDate | null {
  const s = scheduleWorkouts(doc, startDate);
  return s.length ? s[s.length - 1]!.date : null;
}

/**
 * Which plan week (1-based, Mon–Sun from the start date's week) `today` falls in, clamped to the
 * plan's length. Null before the start date or for an empty plan.
 */
export function planWeekNumber(startDate: LocalDate | null, today: LocalDate, totalWeeks: number): number | null {
  if (!startDate || today < startDate || totalWeeks < 1) return null;
  const week = Math.floor(daysBetween(startOfWeek(startDate, 1), today) / 7) + 1;
  return Math.min(week, totalWeeks);
}

export type ExistingSession = {
  id: string;
  date: LocalDate;
  sourceKey: string | null;
  isUserEdited: boolean;
  hasActivity: boolean;
};

/** Frozen sessions (past, edited, completed) are kept; every other one is replaced by the desired drafts. */
export function diffFollowSessions(input: {
  desired: readonly SessionDraft[];
  existing: readonly ExistingSession[];
  today: LocalDate;
}): { deleteIds: string[]; inserts: SessionDraft[] } {
  const frozen = input.existing.filter((s) => s.date < input.today || s.isUserEdited || s.hasActivity);
  const frozenIds = new Set(frozen.map((s) => s.id));
  const keys = new Set(frozen.flatMap((s) => (s.sourceKey ? [s.sourceKey] : [])));
  const dates = new Set(frozen.map((s) => s.date));
  return {
    deleteIds: input.existing.filter((s) => !frozenIds.has(s.id)).map((s) => s.id),
    inserts: input.desired.filter((d) => d.date >= input.today && !keys.has(d.sourceKey) && !dates.has(d.date)),
  };
}
