import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  formatDistance,
  formatDuration,
  formatPace,
  fromDisplayDistance,
  parseDuration,
  toDisplayDistance,
} from ".";

describe("distance conversion", () => {
  it("round-trips through miles", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 500, noNaN: true }), (km) => {
        expect(fromDisplayDistance(toDisplayDistance(km, "mi"), "mi")).toBeCloseTo(km, 9);
      }),
    );
  });

  it("formats", () => {
    expect(formatDistance(10, "km")).toBe("10.0 km");
    expect(formatDistance(42.195, "mi")).toBe("26.2 mi");
  });
});

describe("pace", () => {
  it("formats per km and per mile", () => {
    expect(formatPace(300, "km")).toBe("5:00 /km");
    expect(formatPace(300, "mi")).toBe("8:03 /mi");
    expect(formatPace(299.6, "km")).toBe("5:00 /km");
  });
});

describe("duration", () => {
  it("formats", () => {
    expect(formatDuration(6300)).toBe("1:45:00");
    expect(formatDuration(2700)).toBe("45:00");
    expect(formatDuration(65)).toBe("1:05");
  });

  it("parses h:mm:ss and mm:ss", () => {
    expect(parseDuration("1:45:00")).toBe(6300);
    expect(parseDuration("45:00")).toBe(2700);
    expect(parseDuration(" 3:59:59 ")).toBe(14399);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "45", "1:60:00", "45:60", "a:bc", "1:2:3:4", "-1:00"]) {
      expect(parseDuration(bad), bad).toBeNull();
    }
  });

  it("parse(format(x)) === x", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 24 * 3600 }), (s) => {
        expect(parseDuration(formatDuration(s))).toBe(s);
      }),
    );
  });
});
