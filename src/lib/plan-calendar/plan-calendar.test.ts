import { describe, expect, it } from "vitest";
import { isoWeekday } from "@/lib/time";
import { buildMonthGrid, gridRange, resolveMonth } from "./index";

const today = "2026-10-20";
type S = Parameters<typeof buildMonthGrid>[0]["sessions"][number];
type A = Parameters<typeof buildMonthGrid>[0]["activities"][number];
const s = (id: string, date: string, type: S["type"], targetKm = 8, phase: S["phase"] = "build"): S => ({
  id, date, type, targetKm, phase, structure: null,
});
const a = (id: string, localDate: string, km: number, plannedSessionId: string | null = null): A => ({
  id, localDate, km, plannedSessionId,
});
const grid = (sessions: S[], activities: A[] = [], over: Partial<Parameters<typeof buildMonthGrid>[0]> = {}) =>
  buildMonthGrid({ month: "2026-10", weekStart: 1, today, sessions, activities, ...over });
const day = (g: ReturnType<typeof grid>, date: string) => g.weeks.flatMap((w) => w.days).find((d) => d.date === date)!;

describe("plan calendar", () => {
  it("gridRange covers whole weeks", () => {
    expect(gridRange("2026-10", 1)).toEqual({ from: "2026-09-28", to: "2026-11-01" });
    expect(gridRange("2026-10", 7)).toEqual({ from: "2026-09-27", to: "2026-10-31" });
  });

  it("builds 7-day weeks around the month", () => {
    const g = grid([s("x", "2026-10-06", "easy")]);
    expect(g.weeks).toHaveLength(5);
    expect(g.weeks.every((w) => w.days.length === 7)).toBe(true);
    expect(g.weeks[0].days[0].date).toBe("2026-09-28");
    expect(g.weeks[0].days[0].inMonth).toBe(false);
    expect(day(g, "2026-10-20").isToday).toBe(true);
  });

  it("respects weekStart 7", () => {
    const g = grid([], [], { weekStart: 7 });
    expect(g.weeks[0].start).toBe("2026-09-27");
    expect(isoWeekday(g.weeks[0].days[0].date)).toBe(7);
  });

  it("derives session status", () => {
    const g = grid(
      [s("i", "2026-10-06", "intervals"), s("e", "2026-10-07", "easy"), s("r", "2026-10-08", "rest", 0), s("t", today, "easy")],
      [a("act", "2026-10-06", 8, "i")],
    );
    expect(day(g, "2026-10-06").sessions[0].status).toBe("done");
    expect(day(g, "2026-10-07").sessions[0].status).toBe("missed");
    expect(day(g, "2026-10-08").sessions[0].status).toBe("rest");
    expect(day(g, today).sessions[0].status).toBe("today");
  });

  it("handles two sessions plus an unlinked run on one day", () => {
    const g = grid([s("l", "2026-10-14", "long"), s("iv", "2026-10-14", "intervals")], [a("u", "2026-10-14", 5)]);
    const d = day(g, "2026-10-14");
    expect(d.sessions).toHaveLength(2);
    expect(d.emphasis).toBe("quality");
    expect(d.unlinkedRuns).toEqual([{ id: "u", km: 5 }]);
  });

  it("lists unlinked runs on rest days but not linked ones", () => {
    const g = grid(
      [s("r", "2026-10-08", "rest", 0), s("e", "2026-10-09", "easy")],
      [a("u", "2026-10-08", 3), a("l", "2026-10-09", 8, "e")],
    );
    expect(day(g, "2026-10-08").unlinkedRuns).toEqual([{ id: "u", km: 3 }]);
    expect(day(g, "2026-10-09").unlinkedRuns).toEqual([]);
  });

  it("computes week totals", () => {
    const g = grid(
      [s("a", "2026-10-06", "easy", 8, "base"), s("r", "2026-10-07", "rest", 0), s("b", "2026-10-08", "long", 12), s("c", "2026-10-14", "easy", 6)],
      [a("x", "2026-10-06", 8, "a"), a("u", "2026-10-07", 4)],
    );
    expect(g.weeks[0].plan).toBeNull();
    expect(g.weeks[1].plan).toEqual({ number: 1, phase: "base", plannedKm: 20, actualKm: 12, isCurrent: false });
    expect(g.weeks[2].plan).toMatchObject({ number: 2, plannedKm: 6, isCurrent: false });
    const g2 = grid([s("a", "2026-10-06", "easy"), s("c", "2026-10-20", "easy")]);
    expect(g2.weeks.map((w) => w.plan?.isCurrent ?? false)).toEqual([false, false, false, true, false]);
  });

  it("flags race day", () => {
    const g = grid([s("race", "2026-10-25", "race", 21)]);
    expect(day(g, "2026-10-25").isRace).toBe(true);
    expect(day(g, "2026-10-25").emphasis).toBe("quality");
  });

  it("resolves the month param", () => {
    const sessions = [{ date: "2026-09-01" }, { date: "2026-12-06" }];
    expect(resolveMonth(undefined, today, sessions)).toBe("2026-10");
    expect(resolveMonth("2026-11", today, sessions)).toBe("2026-11");
    expect(resolveMonth("abc", today, sessions)).toBe("2026-10");
    expect(resolveMonth("2026-13", today, sessions)).toBe("2026-10");
    expect(resolveMonth("2030-01", today, sessions)).toBe("2026-10");
    expect(resolveMonth(undefined, "2027-02-01", sessions)).toBe("2026-12");
    expect(resolveMonth(undefined, "2026-06-01", sessions)).toBe("2026-09");
    expect(resolveMonth(undefined, today, [])).toBe("2026-10");
  });

  it("sets prev/next within the plan", () => {
    const sessions = [s("a", "2026-09-01", "easy"), s("b", "2026-12-06", "easy")];
    const first = grid(sessions, [], { month: "2026-09" });
    expect([first.prev, first.next]).toEqual([null, "2026-10"]);
    expect(grid(sessions, [], { month: "2026-12" }).next).toBeNull();
  });
});
