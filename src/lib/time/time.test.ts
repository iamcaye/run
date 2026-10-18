import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  isLocalDate,
  isValidTimeZone,
  isoWeekday,
  startOfWeek,
  todayInTz,
  type IsoWeekday,
} from ".";

const localDateArb = fc
  .date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2100-01-01T00:00:00Z"), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));

describe("todayInTz", () => {
  it("uses the user's zone, not UTC", () => {
    const now = new Date("2026-10-18T23:30:00Z");
    expect(todayInTz("Europe/Madrid", now)).toBe("2026-10-19");
    expect(todayInTz("America/New_York", now)).toBe("2026-10-18");
    expect(todayInTz("UTC", now)).toBe("2026-10-18");
  });
});

describe("validation", () => {
  it("time zones", () => {
    expect(isValidTimeZone("Europe/Madrid")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("local dates", () => {
    expect(isLocalDate("2026-02-28")).toBe(true);
    expect(isLocalDate("2026-02-30")).toBe(false);
    expect(isLocalDate("2026-2-3")).toBe(false);
  });
});

describe("date arithmetic", () => {
  it("handles DST transitions (dates only)", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("addDays and daysBetween are inverse", () => {
    fc.assert(
      fc.property(localDateArb, fc.integer({ min: -2000, max: 2000 }), (d, n) => {
        expect(daysBetween(d, addDays(d, n))).toBe(n);
      }),
    );
  });

  it("isoWeekday", () => {
    expect(isoWeekday("2026-10-18")).toBe(7); // Sunday
    expect(isoWeekday("2026-10-19")).toBe(1); // Monday
  });

  it("startOfWeek lands on weekStart, within the previous 6 days", () => {
    fc.assert(
      fc.property(localDateArb, fc.integer({ min: 1, max: 7 }), (d, ws) => {
        const start = startOfWeek(d, ws as IsoWeekday);
        expect(isoWeekday(start)).toBe(ws);
        const diff = daysBetween(start, d);
        expect(diff).toBeGreaterThanOrEqual(0);
        expect(diff).toBeLessThan(7);
      }),
    );
  });
});
