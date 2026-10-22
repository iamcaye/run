import { describe, expect, it } from "vitest";
import { addEmptyWeek, duplicateWeek, moveWeek, moveWorkout, removeWeek, setDay, weekTotals } from "./ops";
import type { PlanWorkout } from "./types";

const easy8: PlanWorkout = { name: "Easy", type: "easy", notes: null, steps: [{ kind: "steady", km: 8 }] };
const tempo: PlanWorkout = { name: "Tempo", type: "tempo", notes: null, steps: [{ kind: "steady", km: 5, target: { kind: "pace", secPerKm: 300 } }] };
const mk = () => {
  let n = 0;
  const id = () => `w${++n}`;
  return { id, doc: addEmptyWeek(addEmptyWeek({ weeks: [] }, id), id) };
};

describe("ops", () => {
  it("duplicateWeek inserts a deep copy right after the source with a new id", () => {
    const { id, doc } = mk();
    const out = duplicateWeek(setDay(doc, { week: 0, day: 2 }, easy8), 0, id);
    expect(out.weeks.map((w) => w.id)).toEqual(["w1", "w3", "w2"]);
    expect(out.weeks[1]!.days[1]).toEqual(easy8);
    expect(out.weeks[1]!.days[1]).not.toBe(out.weeks[0]!.days[1]);
  });
  it("does not mutate input", () => {
    const { doc } = mk();
    setDay(doc, { week: 0, day: 1 }, easy8);
    expect(doc.weeks[0]!.days[0]).toBeNull();
  });
  it("moveWorkout moves and swaps when the target day is occupied", () => {
    const { doc } = mk();
    const d = setDay(setDay(doc, { week: 0, day: 1 }, easy8), { week: 1, day: 3 }, tempo);
    const moved = moveWorkout(d, { week: 0, day: 1 }, { week: 0, day: 5 });
    expect(moved.weeks[0]!.days[0]).toBeNull();
    expect(moved.weeks[0]!.days[4]).toEqual(easy8);
    const swapped = moveWorkout(d, { week: 0, day: 1 }, { week: 1, day: 3 });
    expect(swapped.weeks[0]!.days[0]).toEqual(tempo);
    expect(swapped.weeks[1]!.days[2]).toEqual(easy8);
  });
  it("removeWeek and moveWeek", () => {
    const { id, doc } = mk();
    const three = addEmptyWeek(doc, id);
    expect(removeWeek(three, 1).weeks.map((w) => w.id)).toEqual(["w1", "w3"]);
    expect(moveWeek(three, 0, 2).weeks.map((w) => w.id)).toEqual(["w2", "w3", "w1"]);
  });
  it("weekTotals counts tempo/intervals/race_pace/race as quality", () => {
    const { doc } = mk();
    const race: PlanWorkout = { ...easy8, type: "race" };
    let d = setDay(doc, { week: 0, day: 1 }, easy8);
    d = setDay(d, { week: 0, day: 3 }, tempo);
    d = setDay(d, { week: 0, day: 7 }, race);
    const t = weekTotals(d.weeks[0]!);
    expect(t.runs).toBe(3);
    expect(t.quality).toBe(2);
    expect(t.km).toBe(21);
  });
});
