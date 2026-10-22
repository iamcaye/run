import { describe, expect, it } from "vitest";
import { WORKOUT_LIMITS } from "@/config/training";
import { builderReducer, initBuilder, type BuilderAction, type BuilderState } from "./builder-reducer";
import type { PlanWorkout } from "./types";

const easy: PlanWorkout = { name: "Easy run", type: "easy", notes: null, steps: [{ kind: "steady", km: 8 }] };
const tempo: PlanWorkout = { name: "Tempo", type: "tempo", notes: null, steps: [{ kind: "steady", km: 5 }] };

function setup(weeks = 1) {
  let n = 0;
  const newId = () => `w${++n}`;
  let s = initBuilder({ name: "Base", description: null, doc: { weeks: [] } });
  for (let i = 0; i < weeks; i++) s = builderReducer(s, { type: "addWeek" }, newId);
  s = { ...s, dirty: false };
  const run = (...actions: BuilderAction[]) => {
    for (const a of actions) s = builderReducer(s, a, newId);
    return s;
  };
  return { run, get: (): BuilderState => s };
}

describe("builderReducer", () => {
  it("starts clean with the first week selected", () => {
    const s = initBuilder({ name: "Base", description: null, doc: { weeks: [{ id: "a", days: Array(7).fill(null) }] } });
    expect(s).toMatchObject({ selected: null, selectedWeek: 0, dirty: false });
  });

  it("duplicateWeek selects the new copy and sets dirty", () => {
    const { run } = setup(2);
    const s = run({ type: "setDay", slot: { week: 0, day: 2 }, workout: easy }, { type: "saved" }, { type: "duplicateWeek", index: 0 });
    expect(s.doc.weeks.map((w) => w.id)).toEqual(["w1", "w3", "w2"]);
    expect(s.selectedWeek).toBe(1);
    expect(s.selected).toBeNull();
    expect(s.doc.weeks[1]!.days[1]).toEqual(easy);
    expect(s.dirty).toBe(true);
  });

  it("saved clears dirty", () => {
    const { run } = setup();
    expect(run({ type: "rename", name: "Base 10K" }).dirty).toBe(true);
    expect(run({ type: "saved" }).dirty).toBe(false);
  });

  it("removeWeek of the selected last week moves selection to the new last week", () => {
    const { run } = setup(3);
    const s = run({ type: "select", slot: { week: 2, day: 1 } }, { type: "removeWeek", index: 2 });
    expect(s.doc.weeks).toHaveLength(2);
    expect(s.selectedWeek).toBe(1);
    expect(s.selected).toBeNull();
    expect(s.dirty).toBe(true);
  });

  it("removeWeek before the selection keeps the same week selected", () => {
    const { run } = setup(3);
    const s = run({ type: "setDay", slot: { week: 2, day: 4 }, workout: easy }, { type: "removeWeek", index: 0 });
    expect(s.selectedWeek).toBe(1);
    expect(s.selected).toEqual({ week: 1, day: 4 });
  });

  it("never removes the only week", () => {
    const { run, get } = setup(1);
    const before = get();
    expect(run({ type: "removeWeek", index: 0 })).toBe(before);
  });

  it("move onto an occupied day swaps and keeps the moved workout selected", () => {
    const { run } = setup();
    const s = run(
      { type: "setDay", slot: { week: 0, day: 1 }, workout: easy },
      { type: "setDay", slot: { week: 0, day: 3 }, workout: tempo },
      { type: "select", slot: { week: 0, day: 1 } },
      { type: "move", from: { week: 0, day: 1 }, to: { week: 0, day: 3 } },
    );
    expect(s.doc.weeks[0]!.days[0]).toEqual(tempo);
    expect(s.doc.weeks[0]!.days[2]).toEqual(easy);
    expect(s.selected).toEqual({ week: 0, day: 3 });
  });

  it("copy duplicates a workout to another day and keeps the selection", () => {
    const { run } = setup();
    const s = run({ type: "setDay", slot: { week: 0, day: 1 }, workout: easy }, { type: "copy", from: { week: 0, day: 1 }, to: { week: 0, day: 5 } });
    expect(s.doc.weeks[0]!.days[4]).toEqual(easy);
    expect(s.doc.weeks[0]!.days[4]).not.toBe(s.doc.weeks[0]!.days[0]);
    expect(s.selected).toEqual({ week: 0, day: 1 });
  });

  it("setDay with a workout selects it; clearing the selected day drops the selection", () => {
    const { run } = setup();
    expect(run({ type: "setDay", slot: { week: 0, day: 6 }, workout: easy }).selected).toEqual({ week: 0, day: 6 });
    expect(run({ type: "setDay", slot: { week: 0, day: 6 }, workout: null }).selected).toBeNull();
  });

  it("moveWeek keeps the moved selected week selected", () => {
    const { run } = setup(3);
    const s = run({ type: "selectWeek", index: 0 }, { type: "moveWeek", from: 0, to: 2 });
    expect(s.doc.weeks.map((w) => w.id)).toEqual(["w2", "w3", "w1"]);
    expect(s.selectedWeek).toBe(2);
  });

  it("selectWeek clamps and clears the slot selection", () => {
    const { run } = setup(2);
    const s = run({ type: "select", slot: { week: 0, day: 1 } }, { type: "selectWeek", index: 9 });
    expect(s.selectedWeek).toBe(1);
    expect(s.selected).toBeNull();
  });

  it("does not grow past the week limit", () => {
    const { run } = setup(WORKOUT_LIMITS.maxWeeks);
    expect(run({ type: "addWeek" }, { type: "duplicateWeek", index: 0 }).doc.weeks).toHaveLength(WORKOUT_LIMITS.maxWeeks);
  });

  it("describe sets the description (blank → null)", () => {
    const { run } = setup();
    expect(run({ type: "describe", description: "Eight weeks" }).description).toBe("Eight weeks");
    expect(run({ type: "describe", description: "  " }).description).toBeNull();
  });
});
