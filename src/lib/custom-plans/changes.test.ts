import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { SessionType } from "@/config/training";
import { mergeChanges, noticeHeadline, sessionChanges, type PlanChange, type SyncedSession } from "./changes";

const s = (date: string, type: SessionType, km: number, weekIndex = 2): SyncedSession => ({
  date,
  weekIndex,
  type,
  targetKm: km,
  structure: { steps: [{ kind: "steady", km }] },
});
const chg = (w: number, i = 0): PlanChange => ({
  date: `2026-${String(w).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
  week: w,
  before: { type: "easy", km: 5 },
  after: { type: "easy", km: 6 },
});

describe("sessionChanges", () => {
  it("pairs by date and drops unchanged days", () => {
    const removed = [s("2026-11-10", "easy", 8), s("2026-11-12", "tempo", 10), s("2026-11-14", "long", 16)];
    const added = [s("2026-11-10", "easy", 8), s("2026-11-12", "intervals", 11), s("2026-11-15", "easy", 6)];
    expect(sessionChanges(removed, added)).toEqual([
      { date: "2026-11-12", week: 3, before: { type: "tempo", km: 10 }, after: { type: "intervals", km: 11 } },
      { date: "2026-11-14", week: 3, before: { type: "long", km: 16 }, after: null },
      { date: "2026-11-15", week: 3, before: null, after: { type: "easy", km: 6 } },
    ]);
  });
  it("reports a day whose steps differ even if type and km match", () => {
    const a = s("2026-11-10", "easy", 8);
    const b = { ...a, structure: null };
    expect(sessionChanges([a], [b])).toHaveLength(1);
  });
});

describe("mergeChanges", () => {
  it("keeps the oldest before and newest after, and drops round trips", () => {
    const a: PlanChange[] = [{ date: "2026-11-12", week: 3, before: { type: "tempo", km: 10 }, after: { type: "easy", km: 6 } }];
    const b: PlanChange[] = [{ date: "2026-11-12", week: 3, before: { type: "easy", km: 6 }, after: { type: "tempo", km: 10 } }];
    expect(mergeChanges(a, b)).toEqual([]);
  });
  it("chains and sorts by date", () => {
    const a: PlanChange[] = [{ date: "2026-11-12", week: 3, before: null, after: { type: "easy", km: 6 } }];
    const b: PlanChange[] = [
      { date: "2026-11-12", week: 3, before: { type: "easy", km: 6 }, after: { type: "long", km: 9 } },
      { date: "2026-11-10", week: 3, before: null, after: { type: "easy", km: 4 } },
    ];
    expect(mergeChanges(a, b).map((c) => [c.date, c.before, c.after])).toEqual([
      ["2026-11-10", null, { type: "easy", km: 4 }],
      ["2026-11-12", null, { type: "long", km: 9 }],
    ]);
  });
  it("has unique dates and no no-op entries (property)", () => {
    const brief = fc.option(
      fc.record({ type: fc.constantFrom<SessionType>("easy", "long", "tempo"), km: fc.integer({ min: 1, max: 3 }) }),
      { nil: null },
    );
    const change = fc.record({
      date: fc.constantFrom("2026-11-10", "2026-11-11", "2026-11-12"),
      week: fc.constant(3),
      before: brief,
      after: brief,
    });
    fc.assert(
      fc.property(fc.array(change), fc.array(change), (o, n) => {
        const out = mergeChanges(o, n);
        expect(new Set(out.map((c) => c.date)).size).toBe(out.length);
        for (const c of out) expect(c.before).not.toEqual(c.after);
      }),
    );
  });
});

describe("noticeHeadline", () => {
  it("names one week or counts weeks", () => {
    expect(noticeHeadline("Ana", [chg(3, 0), chg(3, 1)])).toBe("Ana updated your plan: 2 sessions in week 3 changed");
    expect(noticeHeadline("Ana", [chg(3)])).toBe("Ana updated your plan: 1 session in week 3 changed");
    expect(noticeHeadline("Ana", [chg(3), chg(4)])).toBe("Ana updated your plan: 2 sessions changed across 2 weeks");
  });
});
