import "server-only";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { EFFORT_DESCRIPTIONS, PACES, type SessionType } from "@/config/training";
import { generatePlan, type GeneratePlanResult } from "@/lib/planning/generate";
import { derivePaces } from "@/lib/planning/steps/paces";
import type { PlanGoal, PlanSettings, RecentActivity } from "@/lib/planning/types";
import { addDays, isLocalDate, type IsoWeekday, type LocalDate } from "@/lib/time";
import type { Goal, PlannedSession, Settings, UserScope } from "@/server/dal";

export function toPlanGoal(goal: Goal): PlanGoal {
  return {
    raceDate: goal.raceDate,
    distanceKm: goal.distanceKm,
    goalType: goal.goalType,
    targetTimeSeconds: goal.targetTimeSeconds,
    startWeeklyKm: goal.startWeeklyKm,
    level: goal.level,
  };
}

export function toPlanSettings(settings: Settings): PlanSettings {
  return {
    weekStart: settings.weekStart as IsoWeekday,
    runDays: settings.runDays as IsoWeekday[],
    longRunDay: settings.longRunDay as IsoWeekday,
    maxRunsPerWeek: settings.maxRunsPerWeek,
  };
}

async function recentActivities(scope: UserScope, settings: Settings, today: LocalDate): Promise<RecentActivity[]> {
  const since = new Date(`${addDays(today, -PACES.estimateFromActivities.lookbackDays)}T00:00:00Z`);
  const rows = await scope.activities.since(since);
  return rows.map((a) => ({
    date: format(new TZDate(a.startAt, settings.timezone), "yyyy-MM-dd"),
    km: a.km,
    seconds: a.seconds,
  }));
}

/** Dry run for previews (onboarding, before regenerating). Nothing is stored. */
export async function previewPlan(
  scope: UserScope,
  goal: Goal,
  settings: Settings,
  today: LocalDate,
): Promise<GeneratePlanResult> {
  return generatePlan({
    goal: toPlanGoal(goal),
    settings: toPlanSettings(settings),
    startDate: today,
    today,
    recentActivities: await recentActivities(scope, settings, today),
  });
}

/**
 * Warnings and the weekly volume curve for a stored plan, recomputed from its original start
 * (generation is deterministic, so this matches what was stored, minus later edits).
 */
export async function planInsights(
  scope: UserScope,
  goal: Goal,
  settings: Settings,
  today: LocalDate,
  firstSessionDate: LocalDate | undefined,
): Promise<GeneratePlanResult> {
  const startDate = firstSessionDate && firstSessionDate < today ? firstSessionDate : today;
  return generatePlan({
    goal: toPlanGoal(goal),
    settings: toPlanSettings(settings),
    startDate,
    today,
    recentActivities: await recentActivities(scope, settings, today),
  });
}

/** Generates and stores a plan for a goal that has none yet. Returns null if it already has one. */
export async function createPlanIfMissing(
  scope: UserScope,
  goal: Goal,
  settings: Settings,
  today: LocalDate,
  startDate: LocalDate = today,
): Promise<GeneratePlanResult | null> {
  const existing = await scope.sessions.listForGoal(goal.id);
  if (existing.length > 0) return null;
  const plan = generatePlan({
    goal: toPlanGoal(goal),
    settings: toPlanSettings(settings),
    startDate,
    today,
    recentActivities: await recentActivities(scope, settings, today),
  });
  await scope.sessions.replace(goal.id, [], plan.sessions.map((s) => ({ ...s, isUserEdited: false })));
  return plan;
}

/**
 * Rebuilds sessions from today on. Past sessions, user-edited ones and ones with a linked activity
 * are kept as they are. The curve keeps its original start so week numbering stays stable.
 */
export async function regenerateFuture(
  scope: UserScope,
  goal: Goal,
  settings: Settings,
  today: LocalDate,
): Promise<GeneratePlanResult> {
  const [sessions, linked] = await Promise.all([
    scope.sessions.listForGoal(goal.id),
    scope.sessions.linkedSessionIds(goal.id),
  ]);
  const startDate = sessions[0]?.date && sessions[0].date < today ? sessions[0].date : today;
  const plan = generatePlan({
    goal: toPlanGoal(goal),
    settings: toPlanSettings(settings),
    startDate,
    today,
    recentActivities: await recentActivities(scope, settings, today),
    existingSessions: sessions.map((s) => ({
      id: s.id,
      date: s.date,
      isUserEdited: s.isUserEdited,
      type: s.type,
      targetKm: s.targetKm,
      hasActivity: linked.has(s.id),
    })),
  });
  await scope.sessions.replace(goal.id, plan.deleteIds, plan.sessions.map((s) => ({ ...s, isUserEdited: false })));
  return plan;
}

export type SessionEdit = {
  date: LocalDate;
  type: SessionType;
  targetKm: number;
  effortDescription: string | null;
};

export type EditResult =
  | { ok: true; session: PlannedSession }
  | { ok: false; code: "not_found" | "conflict" | "invalid"; message: string };

/** Manual edit/move. Marks the session as user-edited so regeneration and adaptation leave it alone. */
export async function editSession(
  scope: UserScope,
  sessionId: string,
  edit: SessionEdit,
  settings: Settings,
  today: LocalDate,
): Promise<EditResult> {
  const session = await scope.sessions.get(sessionId);
  if (!session) return { ok: false, code: "not_found", message: "Session not found" };
  const goal = await scope.goals.get(session.goalId);
  if (!goal) return { ok: false, code: "not_found", message: "Session not found" };
  if (!isLocalDate(edit.date) || edit.date > goal.raceDate) {
    return { ok: false, code: "invalid", message: "Pick a date on or before race day" };
  }
  if (edit.date !== session.date) {
    const sameDay = await scope.sessions.listForGoal(goal.id, { from: edit.date, to: edit.date });
    if (sameDay.some((s) => s.id !== session.id)) {
      return { ok: false, code: "conflict", message: "There's already a session on that day" };
    }
  }

  const typeChanged = edit.type !== session.type;
  let targetPaceSecPerKm = session.targetPaceSecPerKm;
  if (typeChanged) {
    const { paces } = derivePaces({ goal: toPlanGoal(goal), recentActivities: await recentActivities(scope, settings, today), today });
    const p = paces?.[edit.type] ?? null;
    targetPaceSecPerKm = p === null ? null : Math.round(p);
  }

  const updated = await scope.sessions.update(sessionId, {
    date: edit.date,
    type: edit.type,
    targetKm: edit.targetKm,
    targetPaceSecPerKm,
    effortDescription: edit.effortDescription ?? EFFORT_DESCRIPTIONS[edit.type],
    // A structure belongs to the original session type.
    structure: typeChanged ? null : session.structure,
    isUserEdited: true,
  });
  return updated ? { ok: true, session: updated } : { ok: false, code: "not_found", message: "Session not found" };
}
