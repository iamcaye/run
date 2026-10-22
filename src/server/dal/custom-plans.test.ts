import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { CustomPlanDoc } from "@/lib/custom-plans/types";
import type { StructureStep } from "@/lib/planning/types";
import { forUser, type UserScope } from "@/server/dal";
import { db } from "@/server/db/client";
import { goal, planFollow, plannedSession } from "@/server/db/schema";
import { createTestUser, goalInput } from "@/test/factories";

const doc = (name = "Easy 5k"): CustomPlanDoc => ({
  weeks: [
    {
      id: "w1",
      days: [
        { name, type: "easy", notes: null, steps: [{ kind: "warmup", km: 5 }] },
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    },
  ],
});

const followSession = (date: string, overrides: { isUserEdited?: boolean } = {}) => ({
  date,
  weekIndex: 0,
  phase: null,
  type: "easy" as const,
  targetKm: 5,
  targetPaceSecPerKm: null,
  effortDescription: "Easy",
  structure: null,
  isUserEdited: overrides.isUserEdited ?? false,
  sourceKey: `w1:${date}`,
});

async function followFor(scope: UserScope) {
  const plan = await scope.customPlans.create({ name: "My plan", description: null });
  const saved = await scope.customPlans.save(plan.id, { name: "My plan", description: null, doc: doc() }, 1);
  if (!saved || saved === "conflict") throw new Error("save failed");
  const follow = await scope.planFollows.upsertForPlan(saved);
  return { plan: saved, follow };
}

async function activeCounts(userId: string) {
  const goals = await db()
    .select({ id: goal.id })
    .from(goal)
    .where(and(eq(goal.userId, userId), eq(goal.status, "active")));
  const follows = await db()
    .select({ id: planFollow.id })
    .from(planFollow)
    .where(and(eq(planFollow.userId, userId), eq(planFollow.status, "active")));
  return { goals: goals.length, follows: follows.length };
}

describe("customPlans.save", () => {
  it("returns conflict on a stale version and leaves the row unchanged", async () => {
    const scope = forUser(await createTestUser("plan-stale"));
    const plan = await scope.customPlans.create({ name: "Base", description: "d" });
    expect(plan.version).toBe(1);
    expect(plan.doc).toEqual({ weeks: [] });

    const ok = await scope.customPlans.save(plan.id, { name: "Renamed", description: null, doc: doc() }, 1);
    expect(ok).not.toBe("conflict");
    expect(ok && ok !== "conflict" ? ok.version : null).toBe(2);

    const stale = await scope.customPlans.save(plan.id, { name: "Stale", description: "x", doc: { weeks: [] } }, 1);
    expect(stale).toBe("conflict");
    const now = await scope.customPlans.get(plan.id);
    expect(now?.name).toBe("Renamed");
    expect(now?.version).toBe(2);
    expect(now?.doc).toEqual(doc());
  });

  it("returns null for an unknown plan", async () => {
    const scope = forUser(await createTestUser("plan-missing"));
    expect(await scope.customPlans.save(randomUUID(), { name: "x", description: null, doc: { weeks: [] } }, 1)).toBeNull();
  });
});

describe("planFollows.upsertForPlan", () => {
  it("creates once per plan and refreshes the name and snapshot", async () => {
    const scope = forUser(await createTestUser("follow-upsert"));
    const { plan, follow } = await followFor(scope);
    expect(follow.status).toBe("inactive");
    expect(follow.snapshot).toEqual(doc());
    const saved = await scope.customPlans.save(plan.id, { name: "New name", description: null, doc: doc("Tempo") }, plan.version);
    if (!saved || saved === "conflict") throw new Error("save failed");
    const again = await scope.planFollows.upsertForPlan(saved);
    expect(again.id).toBe(follow.id);
    expect(again.planName).toBe("New name");
    expect(again.snapshot).toEqual(doc("Tempo"));
    expect((await scope.planFollows.getForPlan(plan.id))?.id).toBe(follow.id);
  });
});

describe("active goal vs active follow", () => {
  it("activating a follow moves the active goal to upcoming, and vice versa", async () => {
    const userId = await createTestUser("one-active");
    const scope = forUser(userId);
    const g = await scope.goals.create(goalInput());
    await scope.goals.activate(g.id);
    const { follow } = await followFor(scope);
    const { follow: other } = await followFor(scope);

    const active = await scope.planFollows.activate(follow.id, "2026-11-02");
    expect(active?.status).toBe("active");
    expect(active?.startDate).toBe("2026-11-02");
    expect((await scope.goals.get(g.id))?.status).toBe("upcoming");
    expect(await activeCounts(userId)).toEqual({ goals: 0, follows: 1 });

    await scope.planFollows.activate(other.id, "2026-11-09");
    expect((await scope.planFollows.get(follow.id))?.status).toBe("inactive");
    expect((await scope.planFollows.getActive())?.id).toBe(other.id);
    expect(await activeCounts(userId)).toEqual({ goals: 0, follows: 1 });

    await scope.goals.activate(g.id);
    expect((await scope.planFollows.get(other.id))?.status).toBe("inactive");
    expect(await scope.planFollows.getActive()).toBeNull();
    expect(await activeCounts(userId)).toEqual({ goals: 1, follows: 0 });

    await scope.planFollows.activate(follow.id, "2026-11-02");
    expect(await scope.planFollows.deactivate(follow.id)).toMatchObject({ status: "inactive" });
    expect(await activeCounts(userId)).toEqual({ goals: 0, follows: 0 });
  });

  it("the database rejects a second active follow", async () => {
    const userId = await createTestUser("dup-follow");
    const row = { userId, planName: "x", snapshot: { weeks: [] }, status: "active" as const };
    await db().insert(planFollow).values(row);
    await expect(db().insert(planFollow).values(row)).rejects.toThrow();
  });
});

describe("deleting a custom plan", () => {
  it("keeps its follow (customPlanId null) and the follow's sessions", async () => {
    const scope = forUser(await createTestUser("plan-delete"));
    const { plan, follow } = await followFor(scope);
    await scope.sessions.replace({ followId: follow.id }, [], [followSession("2026-11-02")]);

    expect(await scope.customPlans.delete(plan.id)).toBe(true);
    expect(await scope.customPlans.get(plan.id)).toBeNull();
    const kept = await scope.planFollows.get(follow.id);
    expect(kept?.customPlanId).toBeNull();
    expect(kept?.snapshot).toEqual(doc());
    expect(await scope.sessions.listFor({ followId: follow.id })).toHaveLength(1);
  });
});

describe("planned_session owner check", () => {
  it("rejects a session with both or neither owner", async () => {
    const userId = await createTestUser("owner-chk");
    const scope = forUser(userId);
    const g = await scope.goals.create(goalInput());
    const { follow } = await followFor(scope);
    const base = { userId, date: "2026-11-02", weekIndex: 0, type: "easy" as const, targetKm: 5 };

    await expect(db().insert(plannedSession).values({ ...base, goalId: g.id, followId: follow.id })).rejects.toThrow();
    await expect(db().insert(plannedSession).values({ ...base })).rejects.toThrow();
    await db().insert(plannedSession).values({ ...base, followId: follow.id });
    await db().insert(plannedSession).values({ ...base, goalId: g.id, phase: "base" });
  });
});

describe("sessions.deleteFutureUnfrozen", () => {
  it("keeps past, linked and user-edited sessions", async () => {
    const scope = forUser(await createTestUser("unfrozen"));
    const { follow } = await followFor(scope);
    const owner = { followId: follow.id };
    await scope.sessions.replace(owner, [], [
      followSession("2026-10-20"), // past
      followSession("2026-10-22"), // today, deletable
      followSession("2026-10-23", { isUserEdited: true }),
      followSession("2026-10-24"), // linked below
      followSession("2026-10-25"), // deletable
    ]);
    const all = await scope.sessions.listFor(owner);
    const linked = all.find((s) => s.date === "2026-10-24");
    if (!linked) throw new Error("missing");
    await scope.activities.upsert({
      externalId: `hk-${randomUUID()}`,
      source: "healthkit",
      startAt: new Date("2026-10-24T08:00:00Z"),
      km: 5,
      seconds: 1800,
      avgHr: null,
      maxHr: null,
      rpe: null,
      hrSeries: null,
      plannedSessionId: linked.id,
      rawImportId: null,
      notes: null,
    });
    // Another owner's future session must survive too.
    const g = await scope.goals.create(goalInput());
    await scope.sessions.createMany(g.id, [{ ...followSession("2026-10-26"), phase: "base" }]);

    expect(await scope.sessions.deleteFutureUnfrozen(owner, "2026-10-22")).toBe(2);
    expect((await scope.sessions.listFor(owner)).map((s) => s.date)).toEqual([
      "2026-10-20",
      "2026-10-23",
      "2026-10-24",
    ]);
    expect(await scope.sessions.listFor({ goalId: g.id })).toHaveLength(1);
    expect(await scope.sessions.linkedSessionIds(owner)).toEqual(new Set([linked.id]));
  });
});

describe("workouts", () => {
  it("create, update, list and delete", async () => {
    const scope = forUser(await createTestUser("workouts"));
    const w = await scope.workouts.create({ name: "Tempo", type: "tempo", notes: null, steps: [] });
    expect(await scope.workouts.list()).toEqual([w]);
    expect((await scope.workouts.update(w.id, { name: "Tempo 2" }))?.name).toBe("Tempo 2");
    expect(await scope.workouts.delete(w.id)).toBe(true);
    expect(await scope.workouts.get(w.id)).toBeNull();
  });

  it("round-trips a 6 x 1000 interval workout", async () => {
    const scope = forUser(await createTestUser("workouts-roundtrip"));
    const steps: StructureStep[] = [
      { kind: "warmup", km: 2 },
      { kind: "reps", reps: 6, repKm: 1, target: { kind: "pace", secPerKm: 240 }, recoverySeconds: 120, recoveryKind: "jog" },
      { kind: "cooldown", km: 2 },
    ];
    const w = await scope.workouts.create({ name: "6 × 1000", type: "intervals", notes: "Controlled", steps });
    expect((await scope.workouts.get(w.id))?.steps).toEqual(steps);
  });
});

describe("planFollows.applySync", () => {
  const brief = (type: "easy" | "tempo" | "intervals") => ({ type, km: 5, stepsKey: "null" });
  const sync = (
    scope: UserScope,
    followId: string,
    expectedSeq: number,
    extra: { date?: string; inserts?: ReturnType<typeof followSession>[]; notice?: { before: "easy" | "tempo"; after: "easy" | "intervals" } } = {},
  ) =>
    scope.planFollows.applySync(followId, {
      expectedSeq,
      snapshotVersion: expectedSeq + 1,
      planName: "My plan",
      authorName: "Ana",
      snapshot: doc(),
      deleteIds: [],
      inserts: extra.inserts ?? [],
      notice: extra.notice
        ? {
            authorName: "Ana",
            changes: [
              { date: extra.date ?? "2026-11-10", week: 1, before: brief(extra.notice.before), after: brief(extra.notice.after) },
            ],
          }
        : null,
    });

  it("rejects a stale sequence and writes nothing", async () => {
    const scope = forUser(await createTestUser("sync-stale"));
    const { follow } = await followFor(scope);
    expect(await sync(scope, follow.id, follow.syncSeq, { inserts: [followSession("2026-11-10")] })).toBe("applied");
    expect(await sync(scope, follow.id, follow.syncSeq, { inserts: [followSession("2026-11-11")] })).toBe("stale");
    const dates = (await scope.sessions.listFor({ followId: follow.id })).map((s) => s.date);
    expect(dates).toEqual(["2026-11-10"]);
    const now = await scope.planFollows.get(follow.id);
    expect(now).toMatchObject({ syncSeq: follow.syncSeq + 1, snapshotVersion: follow.syncSeq + 1 });
  });

  it("merges notices into one open notice, and a dismissed one starts a new notice", async () => {
    const scope = forUser(await createTestUser("sync-notice"));
    const { follow } = await followFor(scope);
    await sync(scope, follow.id, 0, { notice: { before: "tempo", after: "easy" } });
    await sync(scope, follow.id, 1, { notice: { before: "easy", after: "intervals" } });
    const open = await scope.planNotices.listOpen();
    expect(open).toHaveLength(1);
    expect(open[0]!.changes).toHaveLength(1);
    expect(open[0]!.changes[0]!.before?.type).toBe("tempo");
    expect(open[0]!.changes[0]!.after?.type).toBe("intervals");

    expect(await scope.planNotices.dismiss(open[0]!.id)).toBe(true);
    expect(await scope.planNotices.listOpen()).toEqual([]);
    await sync(scope, follow.id, 2, { notice: { before: "easy", after: "intervals" } });
    const again = await scope.planNotices.listOpen();
    expect(again).toHaveLength(1);
    expect(again[0]!.id).not.toBe(open[0]!.id);
  });

  it("deletes the open notice when the merge cancels out", async () => {
    const scope = forUser(await createTestUser("sync-roundtrip"));
    const { follow } = await followFor(scope);
    await sync(scope, follow.id, 0, { notice: { before: "easy", after: "intervals" } });
    await scope.planFollows.applySync(follow.id, {
      expectedSeq: 1,
      snapshotVersion: 2,
      planName: "My plan",
      authorName: "Ana",
      snapshot: doc(),
      deleteIds: [],
      inserts: [],
      notice: {
        authorName: "Ana",
        changes: [{ date: "2026-11-10", week: 1, before: brief("intervals"), after: brief("easy") }],
      },
    });
    expect(await scope.planNotices.listOpen()).toEqual([]);
  });
});

describe("share state and shared follows", () => {
  it("setShare stores the token and flag", async () => {
    const scope = forUser(await createTestUser("share-set"));
    const { plan } = await followFor(scope);
    expect(await scope.customPlans.setShare(plan.id, { shareToken: "tok-abc", shareEnabled: true })).toEqual({
      shareToken: "tok-abc",
      shareEnabled: true,
    });
    expect(await scope.customPlans.setShare(plan.id, { shareEnabled: false })).toEqual({
      shareToken: "tok-abc",
      shareEnabled: false,
    });
  });

  it("listShared is empty for the author and holds the follow for a follower", async () => {
    const author = forUser(await createTestUser("share-author"));
    const followerId = await createTestUser("share-follower");
    const follower = forUser(followerId);
    const { plan, follow } = await followFor(author);
    expect(await author.planFollows.listShared()).toEqual([]);
    await db()
      .insert(planFollow)
      .values({ userId: followerId, customPlanId: plan.id, planName: plan.name, snapshot: plan.doc, authorId: author.userId });
    const shared = await follower.planFollows.listShared();
    expect(shared).toHaveLength(1);
    expect(shared[0]!.customPlanId).toBe(plan.id);
    expect(follow.authorId).toBe(author.userId);
  });
});
