import "server-only";
import type { SessionType } from "@/config/training";
import { sessionChanges, type PlanChange, type SyncedSession } from "@/lib/custom-plans/changes";
import { diffFollowSessions, toSessionDrafts } from "@/lib/custom-plans/schedule";
import type { CustomPlanDoc, SessionDraft } from "@/lib/custom-plans/types";
import { isLocalDate, type LocalDate } from "@/lib/time";
import type { CustomPlan, Goal, PlanFollow, PlannedSessionInput, UserScope } from "@/server/dal";
import { readFollowedPlan } from "@/server/system/shared-plans";

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

/** Where a follow's sessions come from: the live plan, or the follow's snapshot once the plan is gone. */
export type FollowSource = {
  doc: CustomPlanDoc;
  version: number;
  planName: string;
  description: string | null;
  authorName: string | null;
  live: boolean;
};

/** A source built from one of the user's own plans. */
export function ownPlanSource(plan: CustomPlan): FollowSource {
  return { doc: plan.doc, version: plan.version, planName: plan.name, description: plan.description, authorName: null, live: true };
}

/** Own plan → scope.customPlans; someone else's → readFollowedPlan; detached/unreadable → snapshot (live: false). */
export async function resolveFollowSource(scope: UserScope, follow: PlanFollow): Promise<FollowSource> {
  if (follow.customPlanId) {
    const own = follow.authorId === scope.userId ? await scope.customPlans.get(follow.customPlanId) : null;
    if (own) return ownPlanSource(own);
    const shared = await readFollowedPlan(scope.userId, follow.customPlanId);
    if (shared) {
      const { doc, version, name, description, authorName } = shared;
      return { doc, version, planName: name, description, authorName, live: true };
    }
  }
  return {
    doc: follow.snapshot,
    version: follow.snapshotVersion,
    planName: follow.planName,
    description: null,
    authorName: follow.authorName,
    live: false,
  };
}

/**
 * Makes the follow the user's active thing from `startDate`, scheduled from its current source. The
 * previously active goal or plan keeps its past and frozen sessions; the rest of its future is removed.
 */
export async function activateFollow(
  scope: UserScope,
  followId: string,
  startDate: LocalDate,
  today: LocalDate,
): Promise<TrainingResult<PlanFollow>> {
  const follow = await scope.planFollows.get(followId);
  if (!follow) return { ok: false, code: "not_found", message: "Plan not found" };
  if (!isLocalDate(startDate) || startDate < today) return invalid("Pick a start date on or after today");
  const source = await resolveFollowSource(scope, follow);
  if (toSessionDrafts(source.doc, startDate).length === 0) return invalid("Add at least one workout before activating");

  const previous = await getActiveTraining(scope);
  if (previous) await scope.sessions.deleteFutureUnfrozen(previous.owner, today);
  const active = await scope.planFollows.activate(follow.id, startDate);
  if (!active) return { ok: false, code: "not_found", message: "Plan not found" };
  await syncFollowSessions(scope, active, source, today);
  return { ok: true, value: (await scope.planFollows.get(active.id)) ?? active };
}

/** Makes the user's own plan `planId` their active thing from `startDate` (see `activateFollow`). */
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
  const follow = await scope.planFollows.upsertForPlan(plan);
  return activateFollow(scope, follow.id, startDate, today);
}

/** If the active follow is someone else's plan and its version moved on, sync with notify. */
export async function catchUpActiveFollow(scope: UserScope, today: LocalDate): Promise<void> {
  const follow = await scope.planFollows.getActive();
  if (!follow?.customPlanId || follow.authorId === scope.userId) return;
  const source = await resolveFollowSource(scope, follow);
  if (!source.live || source.version === follow.snapshotVersion) return;
  await syncFollowSessions(scope, follow, source, today, { notify: true });
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

const synced = (s: { date: LocalDate; weekIndex: number; type: SessionType; targetKm: number; structure: SyncedSession["structure"] }): SyncedSession => ({
  date: s.date,
  weekIndex: s.weekIndex,
  type: s.type,
  targetKm: s.targetKm,
  structure: s.structure,
});

/** How many times a sync is attempted when another sync of the same follow commits first. */
const SYNC_ATTEMPTS = 2;

/**
 * Brings an active follow's sessions in line with `source` and stores its doc as the snapshot.
 * Frozen sessions are never touched. With `notify` (and someone else's plan), the changed future
 * sessions are merged into the follow's open update notice. Returns "inactive" (doing nothing)
 * unless the follow is active. A sync that lost the race to a concurrent one is recomputed once;
 * a source older than what the follow already holds is not applied.
 */
export async function syncFollowSessions(
  scope: UserScope,
  follow: PlanFollow,
  source: FollowSource,
  today: LocalDate,
  opts: { notify?: boolean } = {},
): Promise<"applied" | "inactive"> {
  for (let attempt = 0; attempt < SYNC_ATTEMPTS; attempt++) {
    const current = await scope.planFollows.get(follow.id);
    if (!current || current.status !== "active" || !current.startDate) return "inactive";
    // A concurrent sync already stored a newer version of the plan.
    if (current.snapshotVersion > source.version) return "applied";
    const { startDate } = current;
    const owner = { followId: current.id };
    const [existing, linked, taken] = await Promise.all([
      scope.sessions.listFor(owner),
      scope.sessions.linkedSessionIds(owner),
      scope.sessions.frozenDatesOfOthers(owner, today),
    ]);
    const { deleteIds, inserts } = diffFollowSessions({
      desired: toSessionDrafts(source.doc, startDate),
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
    const authorName = source.authorName ?? current.authorName;

    let notice: { authorName: string; changes: PlanChange[] } | null = null;
    if (opts.notify && current.authorId !== scope.userId) {
      const removed = new Set(deleteIds);
      const changes = sessionChanges(existing.filter((s) => removed.has(s.id)).map(synced), kept.map(synced));
      if (changes.length > 0) notice = { authorName: authorName ?? "The author", changes };
    }

    const result = await scope.planFollows.applySync(current.id, {
      expectedSeq: current.syncSeq,
      snapshotVersion: source.version,
      planName: source.planName,
      authorName,
      snapshot: source.doc,
      deleteIds,
      inserts: kept.map(toSessionInput),
      notice,
    });
    if (result === "applied") return "applied";
  }
  throw new Error(`Plan follow ${follow.id} kept changing during sync`);
}
