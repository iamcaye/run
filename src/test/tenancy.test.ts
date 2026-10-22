import { randomUUID } from "node:crypto";
import { eq, getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { beforeAll, describe, expect, it } from "vitest";
import { forUser, NotOwnedError } from "@/server/dal";
import { db } from "@/server/db/client";
import * as appSchema from "@/server/db/schema/app";
import { customPlan, goal, planFollow } from "@/server/db/schema";
import { findSharedPlan, followFromToken, generateShareToken, listActiveFollowers, readFollowedPlan } from "@/server/system/shared-plans";
import { createPopulatedUser, createTestUser, goalInput } from "./factories";

/** Tables that are deliberately not user-owned. */
const NOT_USER_OWNED = new Set(["rate_limit"]);

const userOwnedTables = (Object.values(appSchema) as unknown[]).filter(
  (t): t is PgTable => is(t, PgTable) && !NOT_USER_OWNED.has(getTableName(t)),
);

describe("schema", () => {
  it("every user-owned table has a user_id column", () => {
    expect(userOwnedTables.length).toBeGreaterThanOrEqual(13);
    for (const table of userOwnedTables) {
      const cols = Object.values(getTableColumns(table)).map((c) => c.name);
      expect(cols, getTableName(table)).toContain("user_id");
    }
  });

  it("forUser requires a userId", () => {
    expect(() => forUser("")).toThrow();
  });
});

describe("tenancy: user B cannot touch user A's data", () => {
  let a: Awaited<ReturnType<typeof createPopulatedUser>>;
  let b: ReturnType<typeof forUser>;

  beforeAll(async () => {
    a = await createPopulatedUser("alice");
    b = forUser(await createTestUser("bob"));
  });

  it("reads return nothing", async () => {
    expect(await b.goals.get(a.goal.id)).toBeNull();
    expect(await b.goals.list()).toEqual([]);
    expect(await b.goals.getActive()).toBeNull();
    expect(await b.sessions.get(a.session.id)).toBeNull();
    expect(await b.sessions.listForGoal(a.goal.id)).toEqual([]);
    expect(await b.activities.get(a.activity.id)).toBeNull();
    expect(await b.activities.list()).toEqual([]);
    expect(await b.activities.sinceOrPlanStart(new Date("2020-01-01T00:00:00Z"), { goalId: a.goal.id })).toEqual([]);
    expect(
      await b.activities.sinceOrPlanStart(new Date("2020-01-01T00:00:00Z"), { followId: a.follow.id }),
    ).toEqual([]);
    expect(await b.sessions.listFor({ followId: a.follow.id })).toEqual([]);
    expect(await b.sessions.listFor({ goalId: a.goal.id })).toEqual([]);
    expect(await b.sessions.linkedSessionIds({ goalId: a.goal.id })).toEqual(new Set());
    expect(await b.sessions.get(a.followSession.id)).toBeNull();
    expect(await b.workouts.get(a.workout.id)).toBeNull();
    expect(await b.workouts.list()).toEqual([]);
    expect(await b.customPlans.get(a.plan.id)).toBeNull();
    expect(await b.customPlans.list()).toEqual([]);
    expect(await b.planFollows.get(a.follow.id)).toBeNull();
    expect(await b.planFollows.getForPlan(a.plan.id)).toBeNull();
    expect(await b.planFollows.getActive()).toBeNull();
    expect(await b.activities.routePoints(a.activity.id)).toEqual([]);
    expect(await b.importTokens.list()).toEqual([]);
    expect(await b.rawImports.listRecent()).toEqual([]);
    expect(await b.adjustments.get(a.adjustment.id)).toBeNull();
    expect(await b.adjustments.listForGoal(a.goal.id)).toEqual([]);
  });

  it("updates and deletes are no-ops", async () => {
    expect(await b.goals.update(a.goal.id, { name: "pwned" })).toBeNull();
    expect(await b.goals.setStatus(a.goal.id, "abandoned")).toBeNull();
    expect(await b.goals.activate(a.goal.id)).toBeNull();
    expect(await b.goals.delete(a.goal.id)).toBe(false);
    expect(await b.sessions.update(a.session.id, { targetKm: 99 })).toBeNull();
    expect(await b.sessions.delete(a.session.id)).toBe(false);
    expect(await b.activities.update(a.activity.id, { rpe: 1 })).toBeNull();
    expect(await b.activities.delete(a.activity.id)).toBe(false);
    await expect(b.activities.replaceRoute(a.activity.id, [])).rejects.toThrow();
    expect(await b.importTokens.revoke(a.token.id)).toBeNull();
    expect(await b.adjustments.decide(a.adjustment.id, "accepted")).toBeNull();
    expect(await b.workouts.update(a.workout.id, { name: "pwned" })).toBeNull();
    expect(await b.workouts.delete(a.workout.id)).toBe(false);
    expect(
      await b.customPlans.save(a.plan.id, { name: "pwned", description: null, doc: { weeks: [] } }, a.plan.version),
    ).toBeNull();
    expect(await b.customPlans.delete(a.plan.id)).toBe(false);
    expect(await b.planFollows.activate(a.follow.id, "2026-11-02")).toBeNull();
    expect(await b.planFollows.deactivate(a.follow.id)).toBeNull();
    await b.planFollows.updateSnapshot(a.follow.id, "pwned", { weeks: [] });
    expect(await b.sessions.deleteFutureUnfrozen({ followId: a.follow.id }, "2000-01-01")).toBe(0);

    // A's data is untouched.
    const goalNow = await a.scope.goals.get(a.goal.id);
    expect(goalNow?.name).toBe(a.goal.name);
    expect(goalNow?.status).toBe("active");
    expect((await a.scope.sessions.get(a.session.id))?.targetKm).toBe(a.session.targetKm);
    expect((await a.scope.activities.get(a.activity.id))?.rpe).toBeNull();
    expect(await a.scope.activities.routePoints(a.activity.id)).toHaveLength(2);
    expect((await a.scope.importTokens.list())[0]?.revokedAt).toBeNull();
    expect((await a.scope.adjustments.get(a.adjustment.id))?.status).toBe("proposed");
    expect((await a.scope.workouts.get(a.workout.id))?.name).toBe("Tempo");
    expect(await a.scope.customPlans.get(a.plan.id)).toMatchObject({ name: "My plan", version: a.plan.version });
    expect(await a.scope.planFollows.get(a.follow.id)).toMatchObject({ planName: "My plan", status: "inactive" });
    expect(await a.scope.sessions.listFor({ followId: a.follow.id })).toHaveLength(1);
    expect((await a.scope.goals.get(a.goal.id))?.status).toBe("active");
  });

  it("cannot attach own rows to A's rows", async () => {
    await expect(
      b.sessions.createMany(a.goal.id, [
        {
          date: "2026-11-02",
          weekIndex: 0,
          phase: "base",
          type: "easy",
          targetKm: 5,
          targetPaceSecPerKm: null,
          effortDescription: null,
          structure: null,
          isUserEdited: false,
        },
      ]),
    ).rejects.toBeInstanceOf(NotOwnedError);

    await expect(b.sessions.replace({ followId: a.follow.id }, [], [])).rejects.toBeInstanceOf(NotOwnedError);
    await expect(
      b.sessions.replace({ followId: a.follow.id }, [a.followSession.id], []),
    ).rejects.toBeInstanceOf(NotOwnedError);
    await expect(b.planFollows.upsertForPlan(a.plan)).rejects.toBeInstanceOf(NotOwnedError);

    await expect(
      b.adjustments.create({
        goalId: a.goal.id,
        runWeekStart: "2026-11-02",
        rule: "goal_review",
        reason: "x",
        changes: [],
      }),
    ).rejects.toBeInstanceOf(NotOwnedError);

    await expect(
      b.activities.upsert({
        externalId: `hk-${randomUUID()}`,
        source: "healthkit",
        startAt: new Date(),
        km: 5,
        seconds: 1500,
        avgHr: null,
        maxHr: null,
        rpe: null,
        hrSeries: null,
        plannedSessionId: a.session.id,
        rawImportId: null,
        notes: null,
      }),
    ).rejects.toBeInstanceOf(NotOwnedError);
  });

  it("the same externalId under another user creates a separate activity", async () => {
    const theirs = await b.activities.upsert({
      externalId: a.activity.externalId,
      source: "healthkit",
      startAt: new Date(),
      km: 1,
      seconds: 300,
      avgHr: null,
      maxHr: null,
      rpe: null,
      hrSeries: null,
      plannedSessionId: null,
      rawImportId: null,
      notes: null,
    });
    expect(theirs.id).not.toBe(a.activity.id);
    expect((await a.scope.activities.get(a.activity.id))?.km).toBe(a.activity.km);
  });
});

describe("goals", () => {
  it("activate keeps exactly one active goal", async () => {
    const scope = forUser(await createTestUser("multi"));
    const g1 = await scope.goals.create(goalInput({ name: "One" }));
    const g2 = await scope.goals.create(goalInput({ name: "Two" }));
    await scope.goals.activate(g1.id);
    await scope.goals.activate(g2.id);
    expect((await scope.goals.getActive())?.id).toBe(g2.id);
    expect((await scope.goals.get(g1.id))?.status).toBe("upcoming");
  });

  it("the database rejects a second active goal", async () => {
    const userId = await createTestUser("dup");
    await db().insert(goal).values({ ...goalInput(), userId, status: "active" });
    await expect(
      db().insert(goal).values({ ...goalInput(), userId, status: "active" }),
    ).rejects.toThrow();
  });
});

describe("activity upsert", () => {
  it("is idempotent and keeps user-entered RPE and notes", async () => {
    const scope = forUser(await createTestUser("idem"));
    const input = {
      externalId: "hk-same",
      source: "healthkit" as const,
      startAt: new Date("2026-10-10T07:00:00Z"),
      km: 8,
      seconds: 2800,
      avgHr: 150,
      maxHr: 170,
      rpe: null,
      hrSeries: null,
      plannedSessionId: null,
      rawImportId: null,
      notes: null,
    };
    const first = await scope.activities.upsert(input);
    await scope.activities.update(first.id, { rpe: 6, notes: "windy" });
    const second = await scope.activities.upsert({ ...input, km: 8.2 });
    expect(second.id).toBe(first.id);
    expect(second.km).toBe(8.2);
    expect(second.rpe).toBe(6);
    expect(second.notes).toBe("windy");
    expect(await scope.activities.list()).toHaveLength(1);
  });
});

describe("account deletion", () => {
  it("cascades to every user-owned table and leaves other users alone", async () => {
    const doomed = await createPopulatedUser("doomed");
    const survivor = await createPopulatedUser("survivor");
    await db().execute(
      sql`insert into raw_import (user_id, payload_bytes, payload) values (${doomed.userId}, 2, '{}'::jsonb)`,
    );

    await doomed.scope.deleteAccount();

    for (const table of userOwnedTables) {
      const userIdCol = getTableColumns(table).userId;
      if (!userIdCol) throw new Error(`${getTableName(table)} has no userId`);
      const doomedRows = await db().select().from(table).where(eq(userIdCol, doomed.userId));
      expect(doomedRows, getTableName(table)).toHaveLength(0);
    }
    expect(await survivor.scope.goals.get(survivor.goal.id)).not.toBeNull();
    expect(await survivor.scope.activities.routePoints(survivor.activity.id)).toHaveLength(2);
  });
});

describe("shared plans", () => {
  const doc = { weeks: [{ id: "w1", days: [{ name: "Easy", type: "easy" as const, notes: null, steps: [{ kind: "warmup" as const, km: 5 }] }, null, null, null, null, null, null] }] };
  let alice: string;
  let bob: string;
  let planId: string;
  let token: string;

  const setShare = (shareEnabled: boolean, shareToken = token) =>
    db().update(customPlan).set({ shareEnabled, shareToken }).where(eq(customPlan.id, planId));

  beforeAll(async () => {
    alice = await createTestUser("alice");
    bob = await createTestUser("bob");
    const plan = await forUser(alice).customPlans.create({ name: "Alice base", description: "desc" });
    planId = plan.id;
    await forUser(alice).customPlans.save(plan.id, { name: "Alice base", description: "desc", doc }, plan.version);
    token = generateShareToken();
    await setShare(true);
  });

  it("exposes only the public fields", async () => {
    const shared = await findSharedPlan(token);
    expect(Object.keys(shared!).sort()).toEqual(
      ["authorId", "authorName", "description", "doc", "name", "planId", "version"],
    );
    expect(shared!.authorName).toBe("alice");
    expect(JSON.stringify(shared)).not.toContain("@test.local");
  });

  it("returns null for malformed tokens", async () => {
    expect(await findSharedPlan("")).toBeNull();
    expect(await findSharedPlan("nope")).toBeNull();
  });

  it("disabled link: no lookup, no follow", async () => {
    await setShare(false);
    expect(await findSharedPlan(token)).toBeNull();
    expect(await followFromToken(bob, token)).toEqual({ kind: "inactive" });
    await setShare(true);
  });

  it("follow grants reads that survive disabling the link", async () => {
    expect(await readFollowedPlan(bob, planId)).toBeNull();
    const res = await followFromToken(bob, token);
    expect(res.kind).toBe("follow");
    const followed = await readFollowedPlan(bob, planId);
    expect(followed!.doc).toEqual(doc);
    expect(followed!.authorName).toBe("alice");
    await setShare(false);
    expect(await readFollowedPlan(bob, planId)).not.toBeNull();
    await setShare(true);
  });

  it("follow is idempotent and records authorship", async () => {
    const gina = await createTestUser("gina");
    const first = await followFromToken(gina, token);
    const second = await followFromToken(gina, token);
    if (first.kind !== "follow" || second.kind !== "follow") throw new Error("expected follows");
    expect(first.created).toBe(true);
    expect(second.follow.id).toBe(first.follow.id);
    expect(second.created).toBe(false);
    expect(second.follow).toMatchObject({ status: "inactive", authorId: alice, authorName: "alice", planName: "Alice base" });
  });

  it("the author following their own link gets 'own'", async () => {
    expect(await followFromToken(alice, token)).toEqual({ kind: "own", planId });
  });

  it("a regenerated token invalidates the old one", async () => {
    const next = generateShareToken();
    await setShare(true, next);
    expect(await findSharedPlan(token)).toBeNull();
    expect(await findSharedPlan(next)).not.toBeNull();
    await setShare(true, token);
  });

  it("listActiveFollowers excludes the author and inactive follows", async () => {
    const carol = await createTestUser("carol");
    const dave = await createTestUser("dave");
    const c = await followFromToken(carol, token);
    await followFromToken(dave, token);
    if (c.kind !== "follow") throw new Error("expected follow");
    await db().execute(sql`update plan_follow set status = 'active' where id = ${c.follow.id}`);
    await db().execute(
      sql`insert into plan_follow (user_id, custom_plan_id, plan_name, snapshot, status, author_id) values (${alice}, ${planId}, 'x', '{"weeks":[]}'::jsonb, 'active', ${alice})`,
    );
    expect(await listActiveFollowers(planId, alice)).toEqual([{ userId: carol, followId: c.follow.id }]);
  });

  it("deleting the author keeps followers' follows with the author name", async () => {
    const author = await createTestUser("erin");
    const follower = await createTestUser("frank");
    const plan = await forUser(author).customPlans.create({ name: "Erin plan", description: null });
    const t = generateShareToken();
    await db().update(customPlan).set({ shareEnabled: true, shareToken: t }).where(eq(customPlan.id, plan.id));
    await followFromToken(follower, t);
    await forUser(author).deleteAccount();
    const [row] = await db().select().from(planFollow).where(eq(planFollow.userId, follower));
    expect(row).toMatchObject({ customPlanId: null, authorId: null, authorName: "erin" });
  });
});
