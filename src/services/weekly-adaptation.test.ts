import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/adapt-plans/route";
import { addDays } from "@/lib/time";
import { forUser } from "@/server/dal";
import { db } from "@/server/db/client";
import { planAdjustmentRun } from "@/server/db/schema";
import { createTestUser, goalInput } from "@/test/factories";
import { createGoal } from "./goals";
import {
  acceptAdjustment,
  ensureWeeklyAdaptation,
  rejectAdjustment,
  runDueAdaptations,
  runWeeklyAdaptation,
  weekToAdapt,
} from "./weekly-adaptation";

// Monday 2026-10-19, 10:00 UTC (12:00 Madrid) → the week of 2026-10-12 has closed.
const NOW = new Date("2026-10-19T10:00:00Z");
const CLOSED = "2026-10-12";
const PLAN_START = "2026-09-14";

/** A user 5 weeks into a half-marathon plan who ran until `lastRun` and then stopped. */
async function userWhoStopped(lastRun = "2026-10-06", timezone = "Europe/Madrid") {
  const userId = await createTestUser("adapt");
  const scope = forUser(userId);
  const settings = await scope.settings.update({ timezone, weekStart: 1 });
  const created = await createGoal(scope, { ...goalInput({ raceDate: "2027-03-07" }), targetTimeSeconds: 6300, notes: null }, { settings, today: PLAN_START });
  if (!created.ok) throw new Error("goal");
  const sessions = await scope.sessions.listForGoal(created.value.id);
  for (const s of sessions.filter((x) => x.date <= lastRun && x.type !== "rest")) {
    await scope.activities.upsert({
      externalId: `r-${s.id}`,
      source: "healthkit",
      startAt: new Date(`${s.date}T07:00:00Z`),
      km: s.targetKm,
      seconds: Math.round(s.targetKm * 360),
      avgHr: 145,
      maxHr: 160,
      rpe: null,
      hrSeries: null,
      plannedSessionId: s.id,
      rawImportId: null,
      notes: null,
    });
  }
  return { userId, scope, goal: created.value };
}

describe("weekToAdapt", () => {
  const base = { timezone: "Europe/Madrid", weekStart: 1 as const, planStart: PLAN_START, raceDate: "2027-03-07" };
  it("uses the user's time zone and plan bounds", () => {
    expect(weekToAdapt({ ...base, now: NOW })).toBe(CLOSED);
    expect(weekToAdapt({ ...base, now: new Date("2026-10-19T00:30:00Z") })).toBe("2026-10-05"); // 02:30 Madrid
    expect(weekToAdapt({ ...base, now: NOW, planStart: "2026-10-14" })).toBe(CLOSED); // partial first week counts
    expect(weekToAdapt({ ...base, now: NOW, planStart: "2026-10-19" })).toBeNull(); // plan starts after
    expect(weekToAdapt({ ...base, now: NOW, raceDate: "2026-10-18" })).toBeNull(); // race already happened
    expect(weekToAdapt({ ...base, now: NOW, planStart: null })).toBeNull();
  });
});

describe("runWeeklyAdaptation", () => {
  it("proposes an adjustment once per (goal, week)", async () => {
    const { scope, goal } = await userWhoStopped();
    const first = await runWeeklyAdaptation(scope, goal.id, CLOSED);
    expect(first).toEqual({ status: "done", proposals: 1 });
    expect(await runWeeklyAdaptation(scope, goal.id, CLOSED)).toEqual({ status: "skipped" });

    const [adj] = await scope.adjustments.listForGoal(goal.id, "proposed");
    expect(adj).toMatchObject({ rule: "inactivity_gap", runWeekStart: CLOSED });
    expect(adj?.changes.length).toBeGreaterThan(0);
    expect((await scope.adjustmentRuns.get(goal.id, CLOSED))?.status).toBe("done");
  });

  it("retries failed and stale runs, but not fresh running ones", async () => {
    const { scope, goal } = await userWhoStopped();
    await db().insert(planAdjustmentRun).values({ userId: scope.userId, goalId: goal.id, weekStart: CLOSED, status: "running" });
    expect(await runWeeklyAdaptation(scope, goal.id, CLOSED)).toEqual({ status: "skipped" });

    await db().update(planAdjustmentRun).set({ startedAt: new Date(Date.now() - 60 * 60_000) }).where(eq(planAdjustmentRun.goalId, goal.id));
    expect((await runWeeklyAdaptation(scope, goal.id, CLOSED)).status).toBe("done");

    await scope.adjustmentRuns.finish(goal.id, CLOSED, { status: "failed", error: "boom" });
    expect((await runWeeklyAdaptation(scope, goal.id, CLOSED)).status).toBe("done");
  });

  it("a newer run supersedes older pending proposals", async () => {
    const { scope, goal } = await userWhoStopped();
    await scope.adjustments.create({ goalId: goal.id, runWeekStart: "2026-10-05", rule: "low_compliance", reason: "older", changes: [] });
    await runWeeklyAdaptation(scope, goal.id, CLOSED);
    const all = await scope.adjustments.listForGoal(goal.id);
    expect(all.map((a) => `${a.runWeekStart}:${a.status}`).sort()).toEqual([`2026-10-05:superseded`, `${CLOSED}:proposed`]);
  });
});

describe("accept / reject", () => {
  it("accepting applies the changes; drifted sessions are skipped", async () => {
    const { scope, goal } = await userWhoStopped();
    await runWeeklyAdaptation(scope, goal.id, CLOSED);
    const [adj] = await scope.adjustments.listForGoal(goal.id, "proposed");
    if (!adj) throw new Error();
    const [drifted, ...rest] = adj.changes;
    if (!drifted) throw new Error();
    await scope.sessions.update(drifted.sessionId, { targetKm: 1.5, isUserEdited: true });

    const r = await acceptAdjustment(scope, adj.id, "2026-10-19");
    expect(r).toMatchObject({ applied: rest.length, skipped: 1, adjustment: { status: "accepted" } });
    expect((await scope.sessions.get(drifted.sessionId))?.targetKm).toBe(1.5);
    for (const c of rest) {
      if (c.op === "update") expect((await scope.sessions.get(c.sessionId))?.targetKm).toBe(c.after.targetKm);
    }
    expect(await acceptAdjustment(scope, adj.id, "2026-10-19")).toBeNull(); // already decided
  });

  it("rejecting leaves the plan untouched; other users can't decide", async () => {
    const { scope, goal } = await userWhoStopped();
    const intruder = forUser(await createTestUser("intruder"));
    await runWeeklyAdaptation(scope, goal.id, CLOSED);
    const [adj] = await scope.adjustments.listForGoal(goal.id, "proposed");
    if (!adj) throw new Error();
    const before = await scope.sessions.listForGoal(goal.id);

    expect(await acceptAdjustment(intruder, adj.id, "2026-10-19")).toBeNull();
    expect(await rejectAdjustment(intruder, adj.id)).toBeNull();
    expect((await rejectAdjustment(scope, adj.id))?.status).toBe("rejected");
    expect(await scope.sessions.listForGoal(goal.id)).toEqual(before);
  });
});

describe("cron & on-demand fallback", () => {
  it("cron requires the secret", async () => {
    expect((await GET(new Request("http://localhost/api/cron/adapt-plans"))).status).toBe(401);
    expect((await GET(new Request("http://localhost/api/cron/adapt-plans", { headers: { authorization: "Bearer nope" } }))).status).toBe(401);
  });

  it("processes users whose week closed in their own time zone, once", async () => {
    const madrid = await userWhoStopped();
    const newYork = await userWhoStopped("2026-10-06", "America/New_York");
    // 05:30 UTC Monday: 07:30 in Madrid (closed), 01:30 in New York (not yet).
    const early = new Date("2026-10-19T05:30:00Z");
    const summary = await runDueAdaptations(early);
    expect(summary.failed).toBe(0);
    expect((await madrid.scope.adjustmentRuns.get(madrid.goal.id, CLOSED))?.status).toBe("done");
    expect(await newYork.scope.adjustmentRuns.get(newYork.goal.id, CLOSED)).toBeNull();

    await runDueAdaptations(NOW); // 06:00 in New York
    expect((await newYork.scope.adjustmentRuns.get(newYork.goal.id, CLOSED))?.status).toBe("done");
    expect(await madrid.scope.adjustments.listForGoal(madrid.goal.id)).toHaveLength(1); // not run twice
  });

  it("dashboard fallback runs the same job once", async () => {
    const { scope, goal } = await userWhoStopped();
    expect(await ensureWeeklyAdaptation(scope, NOW)).toEqual({ status: "done", proposals: 1 });
    expect(await ensureWeeklyAdaptation(scope, NOW)).toBeNull();
    expect(await scope.adjustments.listForGoal(goal.id)).toHaveLength(1);
  });

  it("an on-track user gets a run but no proposals", async () => {
    const { scope, goal } = await userWhoStopped(addDays(CLOSED, 6));
    const r = await runWeeklyAdaptation(scope, goal.id, CLOSED);
    expect(r.status).toBe("done");
    expect((await scope.adjustments.listForGoal(goal.id)).filter((a) => a.rule !== "goal_review")).toEqual([]);
  });
});
