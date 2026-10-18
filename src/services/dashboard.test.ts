import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/time";
import { forUser } from "@/server/dal";
import { createTestUser, goalInput } from "@/test/factories";
import { getDashboard } from "./dashboard";
import { createGoal } from "./goals";
import { createPlanIfMissing } from "./plans";

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
