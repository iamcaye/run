import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays, isoWeekday } from "@/lib/time";
import { diffFollowSessions, planEndDate, planWeekNumber, scheduleWorkouts, toSessionDrafts } from "./schedule";
import type { CustomPlanDoc, PlanWorkout } from "./types";

const run: PlanWorkout = { name: "Easy", type: "easy", notes: null, steps: [{ kind: "steady", km: 5 }] };
const week = (id: string, days: number[]) => ({
  id,
  days: Array.from({ length: 7 }, (_, i) => (days.includes(i + 1) ? run : null)),
});
const twoWeeksTueAndSun: CustomPlanDoc = { weeks: [week("w1", [2, 7]), week("w2", [2, 7])] };

describe("scheduleWorkouts", () => {
  it("maps week/day to dates from the Monday of the start week", () => {
    const s = scheduleWorkouts(twoWeeksTueAndSun, "2026-11-02");
    expect(s.map((x) => x.date)).toEqual(["2026-11-03", "2026-11-08", "2026-11-10", "2026-11-15"]);
    expect(s[0]!.sourceKey).toBe("w1:2");
  });
  it("skips week-one days before the start date", () => {
    const s = scheduleWorkouts(twoWeeksTueAndSun, "2026-11-05");
    expect(s.map((x) => x.date)).toEqual(["2026-11-08", "2026-11-10", "2026-11-15"]);
  });
  it("planEndDate is the last workout date, or null", () => {
    expect(planEndDate(twoWeeksTueAndSun, "2026-11-02")).toBe("2026-11-15");
    expect(planEndDate({ weeks: [] }, "2026-11-02")).toBeNull();
  });
  it("planWeekNumber counts Mon–Sun plan weeks from the start week, null before start", () => {
    // Starts Thursday 2026-10-22; week 1 is Mon 19 – Sun 25.
    expect(planWeekNumber("2026-10-22", "2026-10-21", 3)).toBeNull();
    expect(planWeekNumber("2026-10-22", "2026-10-22", 3)).toBe(1);
    expect(planWeekNumber("2026-10-22", "2026-10-25", 3)).toBe(1);
    expect(planWeekNumber("2026-10-22", "2026-10-26", 3)).toBe(2);
    expect(planWeekNumber("2026-10-22", "2026-11-30", 3)).toBe(3);
    expect(planWeekNumber(null, "2026-10-22", 3)).toBeNull();
    expect(planWeekNumber("2026-10-22", "2026-10-22", 0)).toBeNull();
  });
  it("toSessionDrafts fills targets and effort", () => {
    const doc: CustomPlanDoc = {
      weeks: [{ id: "a", days: [{ name: "T", type: "tempo", notes: "go", steps: [{ kind: "steady", km: 5.04, target: { kind: "pace", secPerKm: 300 } }] }, null, null, null, null, null, null] }],
    };
    const [d] = toSessionDrafts(doc, "2026-11-02");
    expect(d).toMatchObject({ targetKm: 5, targetPaceSecPerKm: 300, effortDescription: "go", weekIndex: 0, sourceKey: "a:1" });
  });
  it("property: strictly increasing unique dates, >= start, matching weekday", () => {
    const wk = fc.array(fc.boolean(), { minLength: 7, maxLength: 7 });
    fc.assert(
      fc.property(
        fc.array(wk, { maxLength: 8 }),
        fc.integer({ min: 0, max: 800 }),
        (flags, offset) => {
          const weeks = flags.map((b, i) => week(`w${i}`, b.flatMap((x, j) => (x ? [j + 1] : []))));
          const start = addDays("2026-01-01", offset);
          const s = scheduleWorkouts({ weeks }, start);
          s.forEach((x, i) => {
            expect(x.date >= start).toBe(true);
            expect(isoWeekday(x.date)).toBe(x.day);
            if (i > 0) expect(x.date > s[i - 1]!.date).toBe(true);
          });
        },
      ),
    );
  });
});

describe("diffFollowSessions", () => {
  const desired = toSessionDrafts({ weeks: [week("w1", [7]), week("w2", [2, 4, 7])] }, "2026-11-02");
  it("keeps frozen sessions and never doubles a day", () => {
    const out = diffFollowSessions({
      today: "2026-11-10",
      desired,
      existing: [
        { id: "past", date: "2026-11-08", sourceKey: "w1:7", isUserEdited: false, hasActivity: false },
        { id: "done-today", date: "2026-11-10", sourceKey: "w2:2", isUserEdited: false, hasActivity: true },
        { id: "edited", date: "2026-11-12", sourceKey: "w2:4", isUserEdited: true, hasActivity: false },
        { id: "future", date: "2026-11-15", sourceKey: "w2:7", isUserEdited: false, hasActivity: false },
      ],
    });
    expect(out.deleteIds).toEqual(["future"]);
    expect(out.inserts.map((d) => d.date)).toEqual(["2026-11-15"]);
  });
});
