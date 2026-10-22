import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/time";
import { forUser } from "@/server/dal";
import { createTestUser, goalInput } from "@/test/factories";
import { getDashboard } from "./dashboard";
import { createGoal } from "./goals";
import { createPlanIfMissing } from "./plans";
import { activateCustomPlan } from "./training";

const today = "2026-10-18"; // Sunday

async function setup() {
  const scope = forUser(await createTestUser("dash"));
  const settings = await scope.settings.update({ maxHr: 190, restHr: 50 });
  const created = await createGoal(scope, { ...goalInput(), targetTimeSeconds: 6300, notes: null }, { settings, today: addDays(today, -14) });
  if (!created.ok) throw new Error();
  return { scope, settings, goal: created.value };
}

describe("dashboard service", () => {
  it("combines plan, activities and metrics in the user's time zone", async () => {
    const { scope, settings, goal } = await setup();
    const sessions = await scope.sessions.listForGoal(goal.id);
    const done = sessions.filter((s) => s.date < today && s.date >= addDays(today, -6) && s.type !== "rest");
    // Run every session this week except the last, at 07:00 Madrid time.
    for (const s of done.slice(0, -1)) {
      await scope.activities.upsert({
        externalId: `run-${s.id}`,
        source: "healthkit",
        startAt: new Date(`${s.date}T05:00:00Z`),
        km: s.targetKm,
        seconds: Math.round(s.targetKm * 330),
        avgHr: 150,
        maxHr: 165,
        rpe: null,
        hrSeries: null,
        plannedSessionId: s.id,
        rawImportId: null,
        notes: null,
      });
    }
    // A late-night run: 23:30 Madrid on the 17th is 21:30Z — must count on the 17th, not the 18th.
    await scope.activities.upsert({
      externalId: "late",
      source: "manual",
      startAt: new Date(`${addDays(today, -1)}T21:30:00Z`),
      km: 15,
      seconds: 15 * 300,
      avgHr: null,
      maxHr: null,
      rpe: 6,
      hrSeries: null,
      plannedSessionId: null,
      rawImportId: null,
      notes: null,
    });

    const d = await getDashboard(scope, settings, today);
    expect(d.goal?.id).toBe(goal.id);
    expect(d.daysToRace).toBeGreaterThan(100);
    expect(d.thisWeek.length).toBeGreaterThan(0);

    const statuses = Object.fromEntries(d.thisWeek.map((s) => [s.id, s.status]));
    for (const s of done.slice(0, -1)) expect(statuses[s.id]).toBe("done");
    const missed = done.at(-1);
    if (missed) expect(statuses[missed.id]).toBe("missed");

    const current = d.volume.find((w) => w.isCurrent);
    expect(current?.actualKm).toBeCloseTo(done.slice(0, -1).reduce((a, s) => a + s.targetKm, 0) + 15, 6);
    expect(current?.compliance).toBeGreaterThan(0);
    expect(current?.compliance).toBeLessThan(1);

    expect(d.acwr).toHaveLength(56);
    expect(d.acwr.at(-1)?.date).toBe(today);
    expect(d.acwrToday?.insufficientHistory).toBe(true);
    // 15 km at 5:00/km → half-marathon prediction.
    expect(d.prediction?.fromKm).toBe(15);
  });

  it("empty state without an active goal", async () => {
    const scope = forUser(await createTestUser("nogoal"));
    const settings = await scope.settings.get();
    const d = await getDashboard(scope, settings, today);
    expect(d).toMatchObject({ goal: null, thisWeek: [], volume: [], prediction: null, pendingAdjustments: [] });
  });

  it("never mixes in another user's runs", async () => {
    const a = await setup();
    const b = await setup();
    await b.scope.activities.upsert({
      externalId: "b-run",
      source: "manual",
      startAt: new Date(`${addDays(today, -1)}T08:00:00Z`),
      km: 30,
      seconds: 9000,
      avgHr: null,
      maxHr: null,
      rpe: 5,
      hrSeries: null,
      plannedSessionId: null,
      rawImportId: null,
      notes: null,
    });
    const d = await getDashboard(a.scope, a.settings, today);
    expect(d.volume.reduce((s, w) => s + w.actualKm, 0)).toBe(0);
    expect(d.prediction).toBeNull();
    await createPlanIfMissing(a.scope, a.goal, a.settings, today); // no-op: plan exists
  });
});

describe("dashboard with a custom plan active", () => {
  const easy = (km: number) => ({ name: "Easy", type: "easy" as const, notes: null, steps: [{ kind: "steady" as const, km }] });
  const week = (id: string, days: number[], km = 5) => ({
    id,
    days: Array.from({ length: 7 }, (_, i) => (days.includes(i + 1) ? easy(km) : null)),
  });

  async function following(start: string) {
    const scope = forUser(await createTestUser("dash-plan"));
    const settings = await scope.settings.get();
    const created = await scope.customPlans.create({ name: "Spring base", description: null });
    const doc = { weeks: [week("w1", [2, 4]), week("w2", [2, 4, 6], 6), week("w3", [2], 4)] };
    const saved = await scope.customPlans.save(created.id, { name: "Spring base", description: null, doc }, created.version);
    if (!saved || saved === "conflict") throw new Error("plan save failed");
    const r = await activateCustomPlan(scope, saved.id, start, start);
    if (!r.ok) throw new Error(r.message);
    return { scope, settings, plan: saved, follow: r.value };
  }

  it("shows the plan, its week number and no goal metrics", async () => {
    // Starts Tuesday 2026-10-20; the second plan week is Mon 26 Oct – Sun 1 Nov.
    const { scope, settings, plan, follow } = await following("2026-10-20");
    const d = await getDashboard(scope, settings, "2026-10-28");
    expect(d.goal).toBeNull();
    expect(d.plan).toEqual({ followId: follow.id, name: "Spring base", customPlanId: plan.id, endDate: "2026-11-03", finished: false });
    expect(d.weekNumber).toBe(2);
    expect(d.totalWeeks).toBe(3);
    expect(d.daysToRace).toBeNull();
    expect(d.prediction).toBeNull();
    expect(d.pendingAdjustments).toEqual([]);
    expect(d.thisWeek.map((s) => s.date)).toEqual(["2026-10-27", "2026-10-29", "2026-10-31"]);
  });

  it("is not yet numbered before the plan starts", async () => {
    const { scope, settings } = await following("2026-10-22");
    const d = await getDashboard(scope, settings, "2026-10-22");
    expect(d.weekNumber).toBe(1);
    const before = await getDashboard(scope, settings, "2026-10-21");
    expect(before.plan?.name).toBe("Spring base");
    expect(before.weekNumber).toBeNull();
  });

  it("is finished once the last session is past", async () => {
    const { scope, settings } = await following("2026-10-20");
    expect((await getDashboard(scope, settings, "2026-11-03")).plan?.finished).toBe(false);
    const d = await getDashboard(scope, settings, "2026-11-04");
    expect(d.plan?.finished).toBe(true);
    expect(d.weekNumber).toBe(3);
  });

  it("goal users get no plan", async () => {
    const { scope, settings } = await setup();
    expect((await getDashboard(scope, settings, today)).plan).toBeNull();
  });
});
