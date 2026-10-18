import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/time";
import { forUser } from "@/server/dal";
import { createTestUser, goalInput } from "@/test/factories";
import { createGoal } from "./goals";
import { editSession, regenerateFuture } from "./plans";

const today = "2026-10-19";

async function userWithPlan() {
  const scope = forUser(await createTestUser("plans"));
  const settings = await scope.settings.get();
  const created = await createGoal(scope, { ...goalInput(), targetTimeSeconds: 6300, notes: null }, { settings, today });
  if (!created.ok) throw new Error("goal");
  return { scope, settings, goal: created.value };
}

describe("plan persistence", () => {
  it("activating a goal stores a generated plan", async () => {
    const { scope, goal } = await userWithPlan();
    const sessions = await scope.sessions.listForGoal(goal.id);
    expect(sessions.length).toBeGreaterThan(20);
    expect(sessions.at(-1)).toMatchObject({ type: "race", date: goal.raceDate });
    expect(sessions.every((s) => s.date >= today && !s.isUserEdited)).toBe(true);
  });

  it("regeneration keeps past, edited and completed sessions", async () => {
    const { scope, settings, goal } = await userWithPlan();
    const before = await scope.sessions.listForGoal(goal.id);
    const later = addDays(today, 14);
    const [past, edited, completed] = [before[0], before.find((s) => s.date > addDays(later, 7)), before.find((s) => s.date >= later)];
    if (!past || !edited || !completed || edited.id === completed.id) throw new Error("fixture");

    await scope.sessions.update(edited.id, { targetKm: 3.5, isUserEdited: true });
    await scope.activities.upsert({
      externalId: "hk-1",
      source: "healthkit",
      startAt: new Date(`${completed.date}T07:00:00Z`),
      km: 9,
      seconds: 3200,
      avgHr: null,
      maxHr: null,
      rpe: null,
      hrSeries: null,
      plannedSessionId: completed.id,
      rawImportId: null,
      notes: null,
    });

    // Two weeks later the race moves back a week; regenerate from that "today".
    const moved = await scope.goals.update(goal.id, { raceDate: addDays(goal.raceDate, 7) });
    if (!moved) throw new Error("update");
    await regenerateFuture(scope, moved, settings, later);

    const after = await scope.sessions.listForGoal(goal.id);
    const ids = new Set(after.map((s) => s.id));
    expect(ids.has(past.id)).toBe(true); // before `later`, untouched
    expect(ids.has(edited.id)).toBe(true);
    expect(ids.has(completed.id)).toBe(true);
    expect(after.find((s) => s.id === edited.id)?.targetKm).toBe(3.5);
    expect(after.at(-1)).toMatchObject({ type: "race", date: moved.raceDate });
    // Still one session per day.
    expect(new Set(after.map((s) => s.date)).size).toBe(after.length);
  });

  it("editing or moving a session marks it user-edited and refuses double-booking", async () => {
    const { scope, settings, goal } = await userWithPlan();
    const [a, b] = await scope.sessions.listForGoal(goal.id);
    if (!a || !b) throw new Error("fixture");

    const conflict = await editSession(scope, a.id, { date: b.date, type: a.type, targetKm: 5, effortDescription: null }, settings, today);
    expect(conflict).toMatchObject({ ok: false, code: "conflict" });

    const free = addDays(a.date, 1) === b.date ? addDays(a.date, -1) : addDays(a.date, 1);
    const moved = await editSession(scope, a.id, { date: free, type: "tempo", targetKm: 7, effortDescription: null }, settings, today);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.session).toMatchObject({ date: free, type: "tempo", targetKm: 7, isUserEdited: true, structure: null });
    // Target-time goal → tempo pace derived from the goal.
    expect(moved.session.targetPaceSecPerKm).toBeGreaterThan(0);
  });

  it("another user's session is not found", async () => {
    const owner = await userWithPlan();
    const intruder = forUser(await createTestUser("intruder"));
    const [s] = await owner.scope.sessions.listForGoal(owner.goal.id);
    if (!s) throw new Error("fixture");
    const r = await editSession(intruder, s.id, { date: s.date, type: "easy", targetKm: 1, effortDescription: null }, owner.settings, today);
    expect(r).toMatchObject({ ok: false, code: "not_found" });
    expect(await intruder.sessions.linkedSessionIds(owner.goal.id)).toEqual(new Set());
    await expect(intruder.sessions.replace(owner.goal.id, [s.id], [])).rejects.toThrow();
    expect(await owner.scope.sessions.get(s.id)).not.toBeNull();
  });
});
