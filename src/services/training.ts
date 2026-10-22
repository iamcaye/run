import "server-only";
import { diffFollowSessions, toSessionDrafts } from "@/lib/custom-plans/schedule";
import type { CustomPlanDoc, SessionDraft } from "@/lib/custom-plans/types";
import { isLocalDate, type LocalDate } from "@/lib/time";
import type { Goal, PlanFollow, PlannedSessionInput, UserScope } from "@/server/dal";

/** The user's single active thing: a goal (generated plan) or a followed custom plan. */
export type ActiveTraining =
  | { kind: "goal"; goal: Goal; owner: { goalId: string } }
  | { kind: "plan"; follow: PlanFollow; owner: { followId: string } }
  | null;

export type TrainingResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "not_found" | "invalid"; message: string };

const invalid = (message: string) => ({ ok: false, code: "invalid", message }) as const;

export async function getActiveTraining(scope: UserScope): Promise<ActiveTraining> {
  const [goal, follow] = await Promise.all([scope.goals.getActive(), scope.planFollows.getActive()]);
  return activeTrainingOf(goal, follow);
}

/** The active thing from an already loaded active goal and active follow (the goal wins). */
export function activeTrainingOf(goal: Goal | null, follow: PlanFollow | null): ActiveTraining {
  if (goal) return { kind: "goal", goal, owner: { goalId: goal.id } };
  if (follow) return { kind: "plan", follow, owner: { followId: follow.id } };
  return null;
}

/**
 * Makes `planId` the user's active thing from `startDate`. The previously active goal or plan keeps
 * its past and frozen sessions; the rest of its future is removed.
 */
export async function activateCustomPlan(
  scope: UserScope,
  planId: string,
  startDate: LocalDate,
  today: LocalDate,
): Promise<TrainingResult<PlanFollow>> {
  const plan = await scope.customPlans.get(planId);
  if (!plan) return { ok: false, code: "not_found", message: "Plan not found" };
  if (!isLocalDate(startDate) || startDate < today) return invalid("Pick a start date on or after today");
  if (toSessionDrafts(plan.doc, startDate).length === 0) return invalid("Add at least one workout before activating");

  const previous = await getActiveTraining(scope);
  if (previous) await scope.sessions.deleteFutureUnfrozen(previous.owner, today);
  const follow = await scope.planFollows.upsertForPlan(plan);
  const active = await scope.planFollows.activate(follow.id, startDate);
  if (!active) return { ok: false, code: "not_found", message: "Plan not found" };
  await syncFollowSessions(scope, active, plan.doc, today);
  return { ok: true, value: active };
}

/** Stops the active plan: its unfrozen future sessions go, past and frozen ones stay. */
export async function stopCustomPlan(scope: UserScope, today: LocalDate): Promise<TrainingResult<null>> {
  const follow = await scope.planFollows.getActive();
  if (!follow) return { ok: false, code: "not_found", message: "No active plan" };
  await scope.sessions.deleteFutureUnfrozen({ followId: follow.id }, today);
  await scope.planFollows.deactivate(follow.id);
  return { ok: true, value: null };
}

function toSessionInput(d: SessionDraft): PlannedSessionInput {
  return {
    sourceKey: d.sourceKey,
    weekIndex: d.weekIndex,
    date: d.date,
    phase: null,
    type: d.type,
    targetKm: d.targetKm,
    targetPaceSecPerKm: d.targetPaceSecPerKm,
    effortDescription: d.effortDescription,
    structure: d.structure,
    isUserEdited: false,
  };
}

/**
 * Brings an active follow's sessions in line with `doc` (the plan's current doc, or the follow's
 * snapshot once the plan is gone) and stores `doc` as the snapshot. Frozen sessions are never touched.
 * Does nothing unless the follow is active.
 */
export async function syncFollowSessions(
  scope: UserScope,
  follow: PlanFollow,
  doc: CustomPlanDoc,
  today: LocalDate,
): Promise<void> {
  const current = await scope.planFollows.get(follow.id);
  if (!current || current.status !== "active" || !current.startDate) return;
  const { startDate } = current;
  const owner = { followId: current.id };
  const [existing, linked, plan, taken] = await Promise.all([
    scope.sessions.listFor(owner),
    scope.sessions.linkedSessionIds(owner),
    current.customPlanId ? scope.customPlans.get(current.customPlanId) : null,
    scope.sessions.frozenDatesOfOthers(owner, today),
  ]);
  const { deleteIds, inserts } = diffFollowSessions({
    desired: toSessionDrafts(doc, startDate),
    existing: existing.map((s) => ({
      id: s.id,
      date: s.date,
      // Sessions from an earlier run of this plan (before the current start) don't stand in for
      // its workouts: a re-activated plan schedules them again.
      sourceKey: s.date < startDate ? null : s.sourceKey,
      isUserEdited: s.isUserEdited,
      hasActivity: linked.has(s.id),
    })),
    today,
  });
  // Days kept by the previously active goal or plan (done or hand-edited) aren't double-booked.
  const kept = inserts.filter((d) => !taken.has(d.date));
  await scope.sessions.replace(owner, deleteIds, kept.map(toSessionInput));
  await scope.planFollows.updateSnapshot(current.id, plan?.name ?? current.planName, doc);
}
