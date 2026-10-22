import { count, eq, gt } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { CustomPlanDoc, PlanWorkout } from "@/lib/custom-plans/types";
import { isoWeekday } from "@/lib/time";
import { forUser, type UserScope } from "@/server/dal";
import { db } from "@/server/db/client";
import { plannedSession } from "@/server/db/schema";
import { createTestUser, goalInput } from "@/test/factories";
import { linkToPlannedSession } from "./activity-linking";
import { getDashboard } from "./dashboard";
import { activateGoal, createGoal } from "./goals";
import { editSession } from "./plans";
import { activateCustomPlan, getActiveTraining, stopCustomPlan, syncFollowSessions } from "./training";
import { ensureWeeklyAdaptation } from "./weekly-adaptation";

// Thursday.
const today = "2026-10-22";

const run = (km: number): PlanWorkout => ({ name: "Easy", type: "easy", notes: null, steps: [{ kind: "steady", km }] });
const week = (id: string, days: number[], km = 5) => ({
  id,
  days: Array.from({ length: 7 }, (_, i) => (days.includes(i + 1) ? run(km) : null)),
});

async function newUser(label = "training") {
  return forUser(await createTestUser(label));
}

async function savedPlan(scope: UserScope, doc: CustomPlanDoc, name = "My plan") {
  const created = await scope.customPlans.create({ name, description: null });
  const saved = await scope.customPlans.save(created.id, { name, description: null, doc }, created.version);
  if (!saved || saved === "conflict") throw new Error("plan save failed");
  return saved;
}

async function runOn(scope: UserScope, date: string, km: number, plannedSessionId: string | null = null) {
  return scope.activities.upsert({
    externalId: `hk-${date}-${km}-${Math.random()}`,
    source: "healthkit",
    startAt: new Date(`${date}T08:00:00Z`),
    km,
    seconds: Math.round(km * 360),
    avgHr: null,
    maxHr: null,
    rpe: null,
    hrSeries: null,
    plannedSessionId,
    rawImportId: null,
    notes: null,
  });
}

describe("training service", () => {
  it("activates a plan from a Thursday", async () => {
    const scope = await newUser();
    const plan = await savedPlan(scope, { weeks: [week("w1", [2, 4, 6]), week("w2", [2, 4, 6])] });
    const r = await activateCustomPlan(scope, plan.id, today, today);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ status: "active", startDate: today, customPlanId: plan.id, planName: "My plan" });

    const sessions = await scope.sessions.listFor({ followId: r.value.id });
    expect(sessions.map((s) => s.date)).toEqual(["2026-10-22", "2026-10-24", "2026-10-27", "2026-10-29", "2026-10-31"]);
    expect(sessions.every((s) => s.date >= today && [2, 4, 6].includes(isoWeekday(s.date)))).toBe(true);
    expect(sessions.every((s) => s.phase === null && !s.isUserEdited && s.sourceKey)).toBe(true);

    const active = await getActiveTraining(scope);
    expect(active).toMatchObject({ kind: "plan", owner: { followId: r.value.id } });
    expect(await ensureWeeklyAdaptation(scope)).toBeNull();
  });

  it("goal → plan → goal", async () => {
    const scope = await newUser();
    const settings = await scope.settings.get();
    const created = await createGoal(scope, { ...goalInput(), targetTimeSeconds: 6300, notes: null }, { settings, today: "2026-10-01" });
    if (!created.ok) throw new Error("goal");
    const goal = created.value;
    expect(await getActiveTraining(scope)).toMatchObject({ kind: "goal", owner: { goalId: goal.id } });

    const plan = await savedPlan(scope, { weeks: [week("w1", [1, 3, 5]), week("w2", [1, 3, 5])] });
    const r = await activateCustomPlan(scope, plan.id, today, today);
    if (!r.ok) throw new Error(r.message);
    expect(await scope.sessions.listForGoal(goal.id, { from: today })).toEqual([]);
    expect(await scope.sessions.listForGoal(goal.id, { to: "2026-10-21" })).not.toEqual([]);
    expect((await scope.goals.get(goal.id))?.status).toBe("upcoming");

    const later = "2026-10-28";
    const back = await activateGoal(scope, goal.id, { settings, today: later });
    expect(back.ok && back.value.status).toBe("active");
    expect((await scope.planFollows.get(r.value.id))?.status).toBe("inactive");
    expect(await scope.sessions.listFor({ followId: r.value.id }, { from: later })).toEqual([]);
    expect((await scope.sessions.listForGoal(goal.id, { from: later })).length).toBeGreaterThan(10);

    const dupes = await db()
      .select({ date: plannedSession.date, n: count() })
      .from(plannedSession)
      .where(eq(plannedSession.userId, scope.userId))
      .groupBy(plannedSession.date)
      .having(({ n }) => gt(n, 1));
    expect(dupes).toEqual([]);
  });

  it("sync keeps frozen sessions", async () => {
    const scope = await newUser();
    const settings = await scope.settings.get();
    const plan = await savedPlan(scope, { weeks: [week("w1", [4, 5, 6, 7]), week("w2", [4, 5, 6, 7])] });
    const r = await activateCustomPlan(scope, plan.id, today, today);
    if (!r.ok) throw new Error(r.message);
    const before = await scope.sessions.listFor({ followId: r.value.id });
    const [todays, tomorrows] = before;
    if (!todays || !tomorrows || tomorrows.date !== "2026-10-23") throw new Error("fixture");

    await runOn(scope, today, 5.2, todays.id);
    const edited = await editSession(
      scope,
      tomorrows.id,
      { date: tomorrows.date, type: "easy", targetKm: 3, effortDescription: null },
      settings,
      today,
    );
    expect(edited.ok).toBe(true);

    const doc = { weeks: [week("w1", [4, 5, 6, 7], 8), week("w2", [4, 5, 6, 7], 8)] };
    const saved = await scope.customPlans.save(plan.id, { name: "Renamed", description: null, doc }, plan.version);
    if (!saved || saved === "conflict") throw new Error("save");
    const follow = await scope.planFollows.get(r.value.id);
    if (!follow) throw new Error("follow");
    await syncFollowSessions(scope, follow, saved.doc, today);

    const after = await scope.sessions.listFor({ followId: r.value.id });
    expect(after.map((s) => s.date)).toEqual(before.map((s) => s.date));
    expect(after.find((s) => s.date === today)).toMatchObject({ id: todays.id, targetKm: 5 });
    expect(after.find((s) => s.date === "2026-10-23")).toMatchObject({ id: tomorrows.id, targetKm: 3, isUserEdited: true });
    expect(after.filter((s) => s.date > "2026-10-23").every((s) => s.targetKm === 8)).toBe(true);
    expect(await scope.planFollows.get(r.value.id)).toMatchObject({ planName: "Renamed", snapshot: doc });
  });

  it("sync is a no-op for an inactive follow", async () => {
    const scope = await newUser();
    const plan = await savedPlan(scope, { weeks: [week("w1", [4, 5])] });
    const follow = await scope.planFollows.upsertForPlan(plan);
    await syncFollowSessions(scope, follow, plan.doc, today);
    expect(await scope.sessions.listFor({ followId: follow.id })).toEqual([]);
  });

  it("refuses empty plan", async () => {
    const scope = await newUser();
    const noWeeks = await savedPlan(scope, { weeks: [] }, "A");
    const onlyRest = await savedPlan(scope, { weeks: [week("w1", []), week("w2", [])] }, "B");
    for (const p of [noWeeks, onlyRest]) {
      const r = await activateCustomPlan(scope, p.id, today, today);
      expect(r).toEqual({ ok: false, code: "invalid", message: "Add at least one workout before activating" });
    }
    // Workouts only before the start date count as empty too.
    const early = await savedPlan(scope, { weeks: [week("w1", [1, 2])] }, "C");
    expect((await activateCustomPlan(scope, early.id, today, today)).ok).toBe(false);
    expect(await getActiveTraining(scope)).toBeNull();
  });

  it("refuses a start date in the past and unknown plans", async () => {
    const scope = await newUser();
    const plan = await savedPlan(scope, { weeks: [week("w1", [4, 5]), week("w2", [4, 5])] });
    const past = await activateCustomPlan(scope, plan.id, "2026-10-21", today);
    expect(past.ok === false && past.code).toBe("invalid");
    const other = await newUser("other");
    const foreign = await activateCustomPlan(other, plan.id, today, today);
    expect(foreign.ok === false && foreign.code).toBe("not_found");
  });

  it("stops the active plan, keeping frozen sessions", async () => {
    const scope = await newUser();
    const plan = await savedPlan(scope, { weeks: [week("w1", [4, 5, 6]), week("w2", [4, 5, 6])] });
    const r = await activateCustomPlan(scope, plan.id, today, today);
    if (!r.ok) throw new Error(r.message);
    const [todays] = await scope.sessions.listFor({ followId: r.value.id });
    if (!todays) throw new Error("fixture");
    await runOn(scope, today, 5, todays.id);

    expect(await stopCustomPlan(scope, today)).toEqual({ ok: true, value: null });
    expect((await scope.sessions.listFor({ followId: r.value.id })).map((s) => s.id)).toEqual([todays.id]);
    expect(await getActiveTraining(scope)).toBeNull();
    expect((await stopCustomPlan(scope, today)).ok).toBe(false);
  });

  it("activity linking uses the active plan", async () => {
    const scope = await newUser();
    const plan = await savedPlan(scope, { weeks: [week("w1", [4, 5, 6]), week("w2", [4, 5, 6])] });
    const r = await activateCustomPlan(scope, plan.id, today, today);
    if (!r.ok) throw new Error(r.message);
    const target = (await scope.sessions.listFor({ followId: r.value.id }, { from: "2026-10-23", to: "2026-10-23" }))[0];
    if (!target) throw new Error("fixture");

    const activity = await runOn(scope, "2026-10-23", 5.1);
    expect(await linkToPlannedSession(scope, activity, "UTC")).toBe(true);
    expect((await scope.activities.get(activity.id))?.plannedSessionId).toBe(target.id);
  });

  it("edits follow sessions without a race-day bound and checks same-day conflicts", async () => {
    const scope = await newUser();
    const settings = await scope.settings.get();
    const plan = await savedPlan(scope, {
      weeks: [
        {
          id: "w1",
          days: [null, null, null, { name: "T", type: "tempo", notes: null, steps: [{ kind: "steady", km: 6, target: { kind: "pace", secPerKm: 290 } }] }, run(5), null, null],
        },
      ],
    });
    const r = await activateCustomPlan(scope, plan.id, today, today);
    if (!r.ok) throw new Error(r.message);
    const [tempo, easy] = await scope.sessions.listFor({ followId: r.value.id });
    if (!tempo || !easy) throw new Error("fixture");

    const clash = await editSession(scope, tempo.id, { date: easy.date, type: "tempo", targetKm: 6, effortDescription: null }, settings, today);
    expect(clash.ok === false && clash.code).toBe("conflict");

    const moved = await editSession(scope, tempo.id, { date: "2028-01-05", type: "intervals", targetKm: 7, effortDescription: null }, settings, today);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.session).toMatchObject({ date: "2028-01-05", type: "intervals", targetPaceSecPerKm: 290, structure: null, isUserEdited: true });
  });

  it("dashboard shows the active plan's sessions", async () => {
    const scope = await newUser();
    const settings = await scope.settings.update({ weekStart: 1 });
    const plan = await savedPlan(scope, { weeks: [week("w1", [4, 5, 6]), week("w2", [4, 5, 6])] });
    const r = await activateCustomPlan(scope, plan.id, today, today);
    if (!r.ok) throw new Error(r.message);
    const d = await getDashboard(scope, settings, today);
    expect(d.goal).toBeNull();
    expect(d.thisWeek.map((s) => s.date)).toEqual(["2026-10-22", "2026-10-23", "2026-10-24"]);
    expect(d.thisWeekVolume?.plannedKm).toBe(15);
  });
});
