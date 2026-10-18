import { describe, expect, it } from "vitest";
import type { GoalFormValues } from "@/lib/validation/goal";
import { forUser } from "@/server/dal";
import { createTestUser } from "@/test/factories";
import { abandonGoal, activateGoal, createGoal, deleteGoal, logResult, updateGoal } from "./goals";

const today = "2026-10-18";

async function newScope() {
  const scope = forUser(await createTestUser("goals"));
  return Object.assign(scope, { ctx: { settings: await scope.settings.get(), today } });
}

const values = (overrides: Partial<GoalFormValues> = {}): GoalFormValues => ({
  name: "Half",
  raceDate: "2027-03-07",
  distanceKm: 21.0975,
  goalType: "target_time",
  targetTimeSeconds: 6300,
  startWeeklyKm: 30,
  level: "intermediate",
  notes: null,
  ...overrides,
});

describe("goal service", () => {
  it("first goal becomes active; later ones stay upcoming unless requested", async () => {
    const scope = await newScope();
    const first = await createGoal(scope, values({ name: "A" }), scope.ctx);
    const second = await createGoal(scope, values({ name: "B" }), scope.ctx);
    expect(first.ok && first.value.status).toBe("active");
    expect(second.ok && second.value.status).toBe("upcoming");

    const third = await createGoal(scope, values({ name: "C" }), scope.ctx, { makeActive: true });
    expect(third.ok && third.value.status).toBe("active");
    expect((await scope.goals.list()).filter((g) => g.status === "active")).toHaveLength(1);
  });

  it("update reports plan-affecting changes only", async () => {
    const scope = await newScope();
    const created = await createGoal(scope, values(), scope.ctx);
    if (!created.ok) throw new Error();
    const notesOnly = await updateGoal(scope, created.value.id, values({ notes: "hilly" }));
    expect(notesOnly.ok && notesOnly.value.planChanges).toEqual([]);
    const moved = await updateGoal(scope, created.value.id, values({ raceDate: "2027-03-14" }));
    expect(moved.ok && moved.value.planChanges).toEqual(["raceDate"]);
  });

  it("logging a result completes the goal and promotes the next upcoming one", async () => {
    const scope = await newScope();
    const past = await createGoal(scope, values({ name: "Past", raceDate: "2026-10-12" }), scope.ctx);
    await createGoal(scope, values({ name: "Later", raceDate: "2027-06-01" }), scope.ctx);
    await createGoal(scope, values({ name: "Sooner", raceDate: "2027-02-01" }), scope.ctx);
    if (!past.ok) throw new Error();

    const r = await logResult(scope, past.value.id, 6250, scope.ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.goal.status).toBe("completed");
    expect(r.value.goal.resultTimeSeconds).toBe(6250);
    expect(r.value.nextActive?.name).toBe("Sooner");
  });

  it("refuses results before race day and activation of completed goals", async () => {
    const scope = await newScope();
    const g = await createGoal(scope, values(), scope.ctx);
    if (!g.ok) throw new Error();
    expect(await logResult(scope, g.value.id, 6000, scope.ctx)).toMatchObject({ ok: false, code: "invalid_state" });

    const done = await createGoal(scope, values({ raceDate: "2026-10-01" }), scope.ctx);
    if (!done.ok) throw new Error();
    await logResult(scope, done.value.id, 6000, scope.ctx);
    expect(await activateGoal(scope, done.value.id, scope.ctx)).toMatchObject({ ok: false, code: "invalid_state" });
  });

  it("abandoning or deleting the active goal hands over to the next one", async () => {
    const scope = await newScope();
    const a = await createGoal(scope, values({ name: "A" }), scope.ctx);
    await createGoal(scope, values({ name: "B", raceDate: "2027-05-01" }), scope.ctx);
    if (!a.ok) throw new Error();
    const r = await abandonGoal(scope, a.value.id, scope.ctx);
    expect(r.ok && r.value.nextActive?.name).toBe("B");

    const b = await scope.goals.getActive();
    if (!b) throw new Error();
    const d = await deleteGoal(scope, b.id, scope.ctx);
    expect(d.ok && d.value.nextActive).toBeNull();
    expect(await scope.goals.getActive()).toBeNull();
  });

  it("every operation on another user's goal is not_found", async () => {
    const owner = await newScope();
    const intruder = await newScope();
    const g = await createGoal(owner, values({ raceDate: "2026-10-01" }), owner.ctx);
    if (!g.ok) throw new Error();
    const id = g.value.id;

    expect(await updateGoal(intruder, id, values())).toMatchObject({ code: "not_found" });
    expect(await activateGoal(intruder, id, intruder.ctx)).toMatchObject({ code: "not_found" });
    expect(await logResult(intruder, id, 1, intruder.ctx)).toMatchObject({ code: "not_found" });
    expect(await abandonGoal(intruder, id, intruder.ctx)).toMatchObject({ code: "not_found" });
    expect(await deleteGoal(intruder, id, intruder.ctx)).toMatchObject({ code: "not_found" });
    expect((await owner.goals.get(id))?.status).toBe("active");
  });
});
