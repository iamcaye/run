import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { toSessionDrafts } from "@/lib/custom-plans/schedule";
import type { CustomPlanDoc, PlanWorkout } from "@/lib/custom-plans/types";
import { forUser, type CustomPlan, type UserScope } from "@/server/dal";
import { createTestUser, goalInput } from "@/test/factories";
import { editSession } from "./plans";
import { duplicateFollowedPlan, followSharedPlan, propagatePlanUpdate, updatePlanShare } from "./sharing";
import { activateCustomPlan, activateFollow, catchUpActiveFollow, resolveFollowSource } from "./training";

// Monday. Propagation computes each follower's today from the clock, so the clock is pinned.
const today = "2026-10-19";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

const run = (km: number): PlanWorkout => ({ name: "Easy", type: "easy", notes: null, steps: [{ kind: "steady", km }] });
/** Tue, Thu, Sun with `km` (or per-day overrides). */
const week = (id: string, km = 5, over: Partial<Record<2 | 4 | 7, number>> = {}) => ({
  id,
  days: Array.from({ length: 7 }, (_, i) => {
    const day = (i + 1) as 2 | 4 | 7;
    return [2, 4, 7].includes(day) ? run(over[day] ?? km) : null;
  }),
});
const twoWeeks: CustomPlanDoc = { weeks: [week("w1"), week("w2")] };

async function user(label: string) {
  return forUser(await createTestUser(label));
}

async function savedPlan(scope: UserScope, doc: CustomPlanDoc, name = "Plan") {
  const created = await scope.customPlans.create({ name, description: "Two weeks" });
  const saved = await scope.customPlans.save(created.id, { name, description: "Two weeks", doc }, created.version);
  if (!saved || saved === "conflict") throw new Error("plan save failed");
  return saved;
}

async function resave(scope: UserScope, plan: CustomPlan, doc: CustomPlanDoc) {
  const saved = await scope.customPlans.save(plan.id, { name: plan.name, description: plan.description, doc }, plan.version);
  if (!saved || saved === "conflict") throw new Error("plan save failed");
  return saved;
}

/** Alice shares a two-week plan. */
async function sharedPlan() {
  const alice = await user("Alice");
  const plan = await savedPlan(alice, twoWeeks);
  const share = await updatePlanShare(alice, plan.id, "enable");
  if (!share?.shareToken) throw new Error("share failed");
  return { alice, plan, token: share.shareToken };
}

async function follow(scope: UserScope, token: string, activate: boolean) {
  const r = await followSharedPlan(scope, token, { activate, startDate: today }, today);
  if (!r.ok || r.kind !== "follow") throw new Error(`follow failed: ${JSON.stringify(r)}`);
  return r;
}

const shape = (s: { date: string; type: string; targetKm: number; sourceKey: string | null }) => ({
  date: s.date,
  type: s.type,
  targetKm: s.targetKm,
  sourceKey: s.sourceKey,
});

describe("sharing service", () => {
  it("following with activation schedules the plan without a notice", async () => {
    const { token } = await sharedPlan();
    const bob = await user("Bob");
    const r = await follow(bob, token, true);
    expect(r.activated).toBe(true);
    const sessions = await bob.sessions.listFor({ followId: r.followId });
    expect(sessions.map(shape)).toEqual(toSessionDrafts(twoWeeks, today).map(shape));
    expect(await bob.planNotices.listOpen()).toEqual([]);
    expect(await bob.planFollows.get(r.followId)).toMatchObject({ status: "active", authorName: "Alice", planName: "Plan" });
  });

  it("author update keeps frozen sessions and omits them from the notice", async () => {
    const { alice, plan, token } = await sharedPlan();
    const bob = await user("Bob");
    const settings = await bob.settings.get();
    const r = await follow(bob, token, true);
    const before = await bob.sessions.listFor({ followId: r.followId });
    const tue = before.find((s) => s.date === "2026-10-20");
    const thu = before.find((s) => s.date === "2026-10-22");
    if (!tue || !thu) throw new Error("fixture");
    const edited = await editSession(bob, tue.id, { date: tue.date, type: "easy", targetKm: 3, effortDescription: null }, settings, today);
    expect(edited.ok).toBe(true);
    await bob.activities.upsert({
      externalId: `hk-${Math.random()}`,
      source: "healthkit",
      startAt: new Date("2026-10-22T08:00:00Z"),
      km: 5,
      seconds: 1800,
      avgHr: null,
      maxHr: null,
      rpe: null,
      hrSeries: null,
      plannedSessionId: thu.id,
      rawImportId: null,
      notes: null,
    });

    const newDoc = { weeks: [week("w1", 5, { 2: 8, 4: 8, 7: 8 }), week("w2")] };
    await resave(alice, plan, newDoc);
    await propagatePlanUpdate(plan.id, alice.userId);

    const after = await bob.sessions.listFor({ followId: r.followId });
    expect(after.find((s) => s.date === "2026-10-20")).toMatchObject({ id: tue.id, targetKm: 3, isUserEdited: true });
    expect(after.find((s) => s.date === "2026-10-22")).toMatchObject({ id: thu.id, targetKm: 5 });
    expect(after.find((s) => s.date === "2026-10-25")).toMatchObject({ targetKm: 8 });
    expect(after.filter((s) => s.date > "2026-10-25").every((s) => s.targetKm === 5)).toBe(true);

    const notices = await bob.planNotices.listOpen();
    expect(notices).toHaveLength(1);
    expect(notices[0]?.authorName).toBe("Alice");
    expect(notices[0]?.changes.map((c) => c.date)).toEqual(["2026-10-25"]);
    expect(await bob.planFollows.get(r.followId)).toMatchObject({ snapshot: newDoc });
  });

  it("concurrent syncs leave one session per day", async () => {
    const { alice, plan, token } = await sharedPlan();
    const bob = await user("Bob");
    const r = await follow(bob, token, true);
    await resave(alice, plan, { weeks: [week("w1", 7), week("w2", 7)] });

    await Promise.all([propagatePlanUpdate(plan.id, alice.userId), catchUpActiveFollow(bob, today)]);

    const dates = (await bob.sessions.listFor({ followId: r.followId })).map((s) => s.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toEqual(toSessionDrafts(twoWeeks, today).map((d) => d.date));
    const notices = await bob.planNotices.listOpen();
    expect(notices).toHaveLength(1);
    expect(notices[0]?.changes).toHaveLength(6);
  });

  it("propagation skips inactive followers; activating later uses the latest doc", async () => {
    const { alice, plan, token } = await sharedPlan();
    const carol = await user("Carol");
    const r = await follow(carol, token, false);
    expect(r.activated).toBe(false);
    const newDoc = { weeks: [week("w1", 9), week("w2", 9)] };
    const saved = await resave(alice, plan, newDoc);
    await propagatePlanUpdate(plan.id, alice.userId);

    expect(await carol.sessions.listFor({ followId: r.followId })).toEqual([]);
    expect(await carol.planFollows.get(r.followId)).toMatchObject({ snapshot: twoWeeks, status: "inactive" });

    const activated = await activateFollow(carol, r.followId, today, today);
    expect(activated.ok).toBe(true);
    const sessions = await carol.sessions.listFor({ followId: r.followId });
    expect(sessions.map(shape)).toEqual(toSessionDrafts(newDoc, today).map(shape));
    expect(await carol.planFollows.get(r.followId)).toMatchObject({ snapshot: newDoc, snapshotVersion: saved.version });
    expect(await carol.planNotices.listOpen()).toEqual([]);
  });

  it("detached follow activates from snapshot", async () => {
    const { alice, plan, token } = await sharedPlan();
    const bob = await user("Bob");
    const r = await follow(bob, token, false);
    await alice.customPlans.delete(plan.id);

    const detached = await bob.planFollows.get(r.followId);
    if (!detached) throw new Error("follow gone");
    expect(detached.customPlanId).toBeNull();
    const source = await resolveFollowSource(bob, detached);
    expect(source).toMatchObject({ live: false, doc: twoWeeks, planName: "Plan", authorName: "Alice" });

    const activated = await activateFollow(bob, r.followId, today, today);
    expect(activated.ok).toBe(true);
    const sessions = await bob.sessions.listFor({ followId: r.followId });
    expect(sessions.map(shape)).toEqual(toSessionDrafts(twoWeeks, today).map(shape));

    const copy = await duplicateFollowedPlan(bob, r.followId);
    expect(copy).toMatchObject({ userId: bob.userId, name: "Plan (copy)" });
    expect(copy?.doc.weeks).toEqual(twoWeeks.weeks);
    expect(await bob.customPlans.get(copy!.id)).not.toBeNull();
  });

  it("duplicating keeps the name within the limit and refuses other users' follows", async () => {
    const alice = await user("Alice");
    const plan = await savedPlan(alice, twoWeeks, "x".repeat(80));
    const share = await updatePlanShare(alice, plan.id, "enable");
    const bob = await user("Bob");
    const r = await follow(bob, share!.shareToken!, false);
    const copy = await duplicateFollowedPlan(bob, r.followId);
    expect(copy?.name).toHaveLength(80);
    expect(copy?.name.endsWith(" (copy)")).toBe(true);
    expect(await duplicateFollowedPlan(alice, r.followId)).toBeNull();
  });

  it("author's own follow gets no notice from propagation", async () => {
    const { alice, plan, token } = await sharedPlan();
    const own = await activateCustomPlan(alice, plan.id, today, today);
    if (!own.ok) throw new Error(own.message);
    const bob = await user("Bob");
    await follow(bob, token, true);
    const newDoc = { weeks: [week("w1", 6), week("w2", 6)] };
    await resave(alice, plan, newDoc);
    await propagatePlanUpdate(plan.id, alice.userId);
    await catchUpActiveFollow(alice, today);

    expect(await alice.planNotices.listOpen()).toEqual([]);
    expect(await bob.planNotices.listOpen()).toHaveLength(1);
  });

  it("follow links: own plan, disabled link, invalid start date", async () => {
    const { alice, plan, token } = await sharedPlan();
    expect(await followSharedPlan(alice, token, { activate: true, startDate: today }, today)).toEqual({
      ok: true,
      kind: "own",
      planId: plan.id,
    });
    const bob = await user("Bob");
    const early = await followSharedPlan(bob, token, { activate: true, startDate: "2026-10-18" }, today);
    expect(early.ok === false && early.code).toBe("invalid");
    await updatePlanShare(alice, plan.id, "disable");
    const off = await followSharedPlan(bob, token, { activate: false, startDate: today }, today);
    expect(off.ok === false && off.code).toBe("inactive");
    expect(await bob.planFollows.getForPlan(plan.id)).toBeNull();
    expect(await bob.planFollows.getActive()).toBeNull();
  });

  it("following without activation leaves the active goal alone and schedules nothing", async () => {
    const { token } = await sharedPlan();
    const bob = await user("Bob");
    const goal = await bob.goals.create(goalInput());
    await bob.goals.activate(goal.id);
    const r = await follow(bob, token, false);
    expect(r.activated).toBe(false);
    expect(await bob.planFollows.get(r.followId)).toMatchObject({ status: "inactive" });
    expect(await bob.sessions.listFor({ followId: r.followId })).toEqual([]);
    expect(await bob.planFollows.getActive()).toBeNull();
    expect((await bob.goals.getActive())?.id).toBe(goal.id);
  });

  it("updatePlanShare: owner only, enable keeps the token, regenerate changes it", async () => {
    const { alice, plan, token } = await sharedPlan();
    const bob = await user("Bob");
    expect(await updatePlanShare(bob, plan.id, "enable")).toBeNull();
    expect(await updatePlanShare(bob, plan.id, "regenerate")).toBeNull();

    expect(await updatePlanShare(alice, plan.id, "disable")).toEqual({ shareToken: token, shareEnabled: false });
    expect(await updatePlanShare(alice, plan.id, "enable")).toEqual({ shareToken: token, shareEnabled: true });
    const regenerated = await updatePlanShare(alice, plan.id, "regenerate");
    expect(regenerated?.shareEnabled).toBe(true);
    expect(regenerated?.shareToken).toBeTruthy();
    expect(regenerated?.shareToken).not.toBe(token);
  });
});
