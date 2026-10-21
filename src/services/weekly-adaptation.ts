import "server-only";
import pLimit from "p-limit";
import { ADAPTATION, CRON } from "@/config/training";
import type { MetricActivity } from "@/lib/metrics";
import { adaptPlan, type AdjustmentRule } from "@/lib/planning/adapt";
import { addDays, lastClosedWeekStart, localDateOf, startOfWeek, type IsoWeekday, type LocalDate } from "@/lib/time";
import { forUser, type Goal, type Settings, type UserScope } from "@/server/dal";
import { doneRunKeys, listActiveGoalOwners } from "@/server/system/adaptation";
import { toPlanGoal } from "./plans";

/**
 * Weekly plan adaptation as a plain service (no framework code), so it can move to a job runner
 * (Inngest/Trigger.dev) unchanged. Used by the cron endpoint and the dashboard fallback.
 */

export type RunOutcome = { status: "done"; proposals: number } | { status: "skipped" } | { status: "failed"; error: string };

/**
 * The closed week to adapt for, or null: it must have fully closed in the user's time zone, fall
 * within the plan (on/after its first week, before race day).
 */
export function weekToAdapt(input: {
  now: Date;
  timezone: string;
  weekStart: IsoWeekday;
  planStart: LocalDate | null;
  raceDate: LocalDate;
}): LocalDate | null {
  if (!input.planStart) return null;
  const closed = lastClosedWeekStart(input.now, input.timezone, input.weekStart, CRON.weekCloseHourLocal);
  if (closed < startOfWeek(input.planStart, input.weekStart) || addDays(closed, 7) > input.raceDate) return null;
  return closed;
}

/** Claims, runs and records one user's weekly adaptation. Idempotent per (goal, week). */
export async function runWeeklyAdaptation(scope: UserScope, goalId: string, weekStart: LocalDate): Promise<RunOutcome> {
  if (!(await scope.adjustmentRuns.claim(goalId, weekStart, ADAPTATION.staleRunMinutes))) return { status: "skipped" };
  try {
    const goal = await scope.goals.get(goalId);
    if (!goal || goal.status !== "active") {
      await scope.adjustmentRuns.finish(goalId, weekStart, { status: "done" });
      return { status: "done", proposals: 0 };
    }
    const settings = await scope.settings.get();
    const [sessions, previous] = await Promise.all([scope.sessions.listForGoal(goalId), scope.adjustments.listForGoal(goalId)]);
    // Enough history for ACWR's 28-day window before the closed week.
    const since = addDays(weekStart, -35);
    const rows = await scope.activities.since(new Date(`${addDays(since, -1)}T00:00:00Z`));
    const activities: MetricActivity[] = rows.map((a) => ({
      id: a.id,
      localDate: localDateOf(a.startAt, settings.timezone),
      km: a.km,
      seconds: a.seconds,
      rpe: a.rpe,
      avgHr: a.avgHr,
      plannedSessionId: a.plannedSessionId,
    }));

    const drafts = adaptPlan({
      goal: toPlanGoal(goal),
      settings: { maxHr: settings.maxHr, restHr: settings.restHr, weekStart: settings.weekStart as IsoWeekday },
      sessions,
      activities,
      weekStart,
      previousAdjustments: previous.map((p) => ({ rule: p.rule as AdjustmentRule, runWeekStart: p.runWeekStart })),
    });

    if (drafts.length > 0) {
      await scope.adjustments.supersedePending(goalId);
      for (const d of drafts) {
        await scope.adjustments.create({ goalId, runWeekStart: weekStart, rule: d.rule, reason: d.reason, changes: d.changes });
      }
    }
    await scope.adjustmentRuns.finish(goalId, weekStart, { status: "done" });
    return { status: "done", proposals: drafts.length };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await scope.adjustmentRuns.finish(goalId, weekStart, { status: "failed", error });
    return { status: "failed", error };
  }
}

export type CronSummary = {
  checked: number;
  due: number;
  done: number;
  skipped: number;
  failed: number;
  proposals: number;
  errors: { userId: string; error: string }[];
};

/** Cron entry point: every user whose week just closed in their own time zone and has no run yet. */
export async function runDueAdaptations(now: Date = new Date()): Promise<CronSummary> {
  const owners = await listActiveGoalOwners();
  const done = await doneRunKeys(addDays(now.toISOString().slice(0, 10), -21));
  const due = owners.flatMap((o) => {
    const week = weekToAdapt({ now, timezone: o.timezone, weekStart: o.weekStart as IsoWeekday, planStart: o.planStart, raceDate: o.raceDate });
    return week && !done.has(`${o.userId}|${o.goalId}|${week}`) ? [{ ...o, week }] : [];
  });

  const limit = pLimit(CRON.concurrency);
  const results = await Promise.allSettled(due.map((o) => limit(() => runWeeklyAdaptation(forUser(o.userId), o.goalId, o.week))));

  const summary: CronSummary = { checked: owners.length, due: due.length, done: 0, skipped: 0, failed: 0, proposals: 0, errors: [] };
  results.forEach((r, i) => {
    const userId = due[i]?.userId ?? "?";
    if (r.status === "rejected") {
      summary.failed++;
      summary.errors.push({ userId, error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
    } else if (r.value.status === "done") {
      summary.done++;
      summary.proposals += r.value.proposals;
    } else if (r.value.status === "skipped") summary.skipped++;
    else {
      summary.failed++;
      summary.errors.push({ userId, error: r.value.error });
    }
  });
  return summary;
}

/** Dashboard fallback: same function and idempotency, for the signed-in user only. */
export async function ensureWeeklyAdaptation(scope: UserScope, now: Date = new Date()): Promise<RunOutcome | null> {
  const goal = await scope.goals.getActive();
  if (!goal) return null;
  const [settings, [first]] = await Promise.all([scope.settings.get(), scope.sessions.listForGoal(goal.id)]);
  return ensureWeeklyAdaptationFor(scope, { goal, planStart: first?.date ?? null, settings }, now);
}

/**
 * The same fallback from state the caller already loaded (the dashboard has the goal, plan start and settings),
 * so the usual "nothing due" case costs a single query.
 */
export async function ensureWeeklyAdaptationFor(
  scope: UserScope,
  state: { goal: Goal | null; planStart: LocalDate | null; settings: Settings },
  now: Date = new Date(),
): Promise<RunOutcome | null> {
  const { goal, settings } = state;
  if (!goal) return null;
  const week = weekToAdapt({
    now,
    timezone: settings.timezone,
    weekStart: settings.weekStart as IsoWeekday,
    planStart: state.planStart,
    raceDate: goal.raceDate,
  });
  if (!week) return null;
  const existing = await scope.adjustmentRuns.get(goal.id, week);
  if (existing?.status === "done") return null;
  return runWeeklyAdaptation(scope, goal.id, week);
}

export async function acceptAdjustment(scope: UserScope, id: string, today: LocalDate) {
  return scope.adjustments.accept(id, today);
}

export async function rejectAdjustment(scope: UserScope, id: string) {
  return scope.adjustments.decide(id, "rejected");
}
