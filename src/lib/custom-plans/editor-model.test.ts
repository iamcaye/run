import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { StructureStep } from "@/lib/planning/types";
import { KM_PER_MI } from "@/lib/units";
import { stepSchema } from "@/lib/validation/custom-plan";
import {
  type BlockDisplay,
  estimateLabel,
  fromDisplay,
  newBlock,
  parseDistance,
  parsePace,
  parseTime,
  stepPace,
  stepValue,
  switchTarget,
  toDisplay,
  toggleMeasure,
  toggleRecoveryMeasure,
} from "./editor-model";

describe("newBlock", () => {
  it("has the documented defaults", () => {
    expect(newBlock("warmup")).toEqual({ kind: "warmup", km: 2 });
    expect(newBlock("cooldown")).toEqual({ kind: "cooldown", km: 2 });
    expect(newBlock("steady")).toEqual({ kind: "steady", km: 5 });
    expect(newBlock("reps")).toEqual({ kind: "reps", reps: 6, repKm: 1, recoverySeconds: 120, recoveryKind: "jog" });
  });
  it("produces valid steps", () => {
    for (const k of ["warmup", "steady", "reps", "cooldown"] as const) {
      expect(stepSchema.safeParse(newBlock(k)).success).toBe(true);
    }
  });
});

describe("toDisplay / fromDisplay", () => {
  it("round-trips miles", () => {
    const x: StructureStep = {
      kind: "reps",
      reps: 6,
      repKm: KM_PER_MI,
      target: { kind: "pace", secPerKm: Math.round(390 / KM_PER_MI) },
      recoverySeconds: 120,
      recoveryKind: "jog",
    };
    const d = toDisplay(x, "mi");
    expect(d.amount).toEqual({ measure: "distance", value: expect.closeTo(1, 9) });
    expect(d.target.kind).toBe("pace");
    const back = fromDisplay(d, "mi");
    if (back.kind !== "reps") throw new Error("kind changed");
    expect(Math.abs(back.repKm! - x.repKm!)).toBeLessThan(1e-9);
    expect({ ...back, repKm: x.repKm }).toEqual(x);
  });

  it("round-trips every kind and measure in km and mi", () => {
    const steps: StructureStep[] = [
      { kind: "warmup", km: 2 },
      { kind: "warmup", seconds: 600, target: { kind: "hr_zone", zone: 2 } },
      { kind: "steady", km: 8.3, target: { kind: "pace", secPerKm: 255 } },
      { kind: "steady", seconds: 1200, target: { kind: "rpe", rpe: 6 } },
      { kind: "reps", reps: 10, repSeconds: 60, recoveryKm: 0.2, recoveryKind: "walk" },
      { kind: "cooldown", km: 1.5 },
    ];
    for (const units of ["km", "mi"] as const) {
      for (const s of steps) {
        const back = fromDisplay(toDisplay(s, units), units) as Record<string, unknown>;
        for (const [k, v] of Object.entries(s)) {
          if (typeof v === "number") expect(Math.abs((back[k] as number) - v)).toBeLessThan(1e-9);
          else expect(back[k]).toEqual(v);
        }
        expect(Object.keys(back).sort()).toEqual(Object.keys(s).sort());
      }
    }
  });

  it("normalizes legacy generated steps into valid custom steps", () => {
    const legacy: StructureStep = { kind: "steady", km: 6, zone: "tempo", paceSecPerKm: 250, effort: "comfortably hard" };
    const back = fromDisplay(toDisplay(legacy, "km"), "km");
    expect(back).toEqual({
      kind: "steady",
      km: 6,
      zone: "tempo",
      effort: "comfortably hard",
      target: { kind: "pace", secPerKm: 250 },
    });
    expect(stepSchema.safeParse(back).success).toBe(true);
    // Reps without any recovery get a default so they validate.
    const reps = fromDisplay(toDisplay({ kind: "reps", reps: 4, repKm: 0.4, zone: "intervals" }, "km"), "km");
    expect(stepSchema.safeParse(reps).success).toBe(true);
  });

  it("only ever emits schema-valid steps, whatever the display values", () => {
    const num = fc.double({ min: -1e6, max: 1e6, noNaN: true });
    const amount = fc.record({ measure: fc.constantFrom("distance" as const, "time" as const), value: num });
    const target = fc.oneof(
      fc.constant({ kind: "none" as const }),
      fc.record({ kind: fc.constant("pace" as const), secPerUnit: num }),
      fc.record({ kind: fc.constant("hr_zone" as const), zone: fc.constantFrom(1, 2, 3, 4, 5) as fc.Arbitrary<1 | 2 | 3 | 4 | 5> }),
      fc.record({ kind: fc.constant("rpe" as const), rpe: num }),
    );
    const display: fc.Arbitrary<BlockDisplay> = fc.oneof(
      fc.record({ kind: fc.constantFrom("warmup" as const, "steady" as const, "cooldown" as const), amount, target }),
      fc.record({
        kind: fc.constant("reps" as const),
        reps: num,
        amount,
        target,
        recovery: amount,
        recoveryKind: fc.constantFrom("jog" as const, "walk" as const, "stand" as const),
      }),
    );
    fc.assert(
      fc.property(display, fc.constantFrom("km" as const, "mi" as const), (d, units) => {
        expect(stepSchema.safeParse(fromDisplay(d, units)).success).toBe(true);
      }),
    );
  });
});

describe("toggleMeasure", () => {
  it("converts a distance block to an equivalent, step-snapped time and back", () => {
    const d = toDisplay({ kind: "warmup", km: 2 }, "km");
    const t = toggleMeasure(d, "km");
    expect(t.amount).toEqual({ measure: "time", value: 720 });
    expect(toggleMeasure(t, "km").amount).toEqual({ measure: "distance", value: 2 });
  });
  it("uses the rep pace and rep step for reps", () => {
    const d = toDisplay(newBlock("reps"), "km");
    expect(toggleMeasure(d, "km").amount).toEqual({ measure: "time", value: 285 });
  });
  it("toggles recovery between time and distance", () => {
    const d = toDisplay(newBlock("reps"), "km");
    if (d.kind !== "reps") throw new Error();
    const r = toggleRecoveryMeasure(d, "km");
    if (r.kind !== "reps") throw new Error();
    expect(r.recovery).toEqual({ measure: "distance", value: 0.3 });
  });
});

describe("switchTarget", () => {
  it("defaults by block intensity", () => {
    const reps = toDisplay(newBlock("reps"), "km");
    expect(switchTarget(reps, "hr_zone", "km").target).toEqual({ kind: "hr_zone", zone: 4 });
    expect(switchTarget(reps, "rpe", "km").target).toEqual({ kind: "rpe", rpe: 7 });
    expect(switchTarget(reps, "pace", "km").target).toEqual({ kind: "pace", secPerUnit: 285 });
    const easy = toDisplay(newBlock("steady"), "mi");
    expect(switchTarget(easy, "hr_zone", "mi").target).toEqual({ kind: "hr_zone", zone: 2 });
    expect(switchTarget(easy, "pace", "mi").target).toEqual({ kind: "pace", secPerUnit: 580 });
    expect(switchTarget(easy, "none", "mi").target).toEqual({ kind: "none" });
  });
});

describe("stepValue", () => {
  it("snaps to the step grid", () => {
    expect(stepValue(1.24, 0.5, 1, 100)).toBe(1.5);
    expect(stepValue(1.24, 0.5, -1, 100)).toBe(1);
    expect(stepValue(1.5, 0.5, -1, 100)).toBe(1);
    expect(stepValue(0.2, 0.1, 1, 100)).toBe(0.3);
    expect(stepValue(0.7, 0.1, -1, 100)).toBe(0.6);
  });
  it("never goes below one step or above max", () => {
    expect(stepValue(0.5, 0.5, -1, 100)).toBe(0.5);
    expect(stepValue(0.3, 0.5, -1, 100)).toBe(0.3);
    expect(stepValue(99.8, 0.5, 1, 100)).toBe(100);
  });
});

describe("stepPace", () => {
  it("keeps stepping until the stored whole-second sec/km changes", () => {
    // 242 s/km = 6:29.5 /mi; +5 snaps to 6:30 /mi, which still stores 242, so it moves on to 6:35.
    expect(stepPace(242 * KM_PER_MI, 1, "mi")).toBe(395);
    expect(stepPace(245 * KM_PER_MI, -1, "mi")).toBe(390);
    expect(stepPace(240, 1, "km")).toBe(245);
  });
  it("stays within the pace limits", () => {
    expect(stepPace(120, -1, "km")).toBe(120);
    expect(stepPace(900, 1, "km")).toBe(900);
  });
});

describe("parsers", () => {
  it("parses pace tolerantly", () => {
    expect(parsePace("6:30")).toBe(390);
    expect(parsePace(" 4:05 /km")).toBe(245);
    expect(parsePace("4:5")).toBe(245);
    expect(parsePace("6.30")).toBe(390);
    expect(parsePace("6")).toBe(360);
    expect(parsePace("6:75")).toBeNull();
    expect(parsePace("abc")).toBeNull();
    expect(parsePace("")).toBeNull();
  });
  it("parses times, with a bare number in the given unit", () => {
    expect(parseTime("2:00", "s")).toBe(120);
    expect(parseTime("1:00:00", "min")).toBe(3600);
    expect(parseTime("90", "s")).toBe(90);
    expect(parseTime("10", "min")).toBe(600);
    expect(parseTime("0", "s")).toBeNull();
    expect(parseTime("x", "s")).toBeNull();
  });
  it("parses positive distances, accepting a decimal comma", () => {
    expect(parseDistance("1,5")).toBe(1.5);
    expect(parseDistance("0.4 km")).toBe(0.4);
    expect(parseDistance("0")).toBeNull();
    expect(parseDistance("-1")).toBeNull();
    expect(parseDistance("x")).toBeNull();
  });
});

describe("estimateLabel", () => {
  it("summarizes distance and minutes", () => {
    const steps: StructureStep[] = [
      { kind: "warmup", km: 2 },
      { kind: "reps", reps: 6, repKm: 1, target: { kind: "pace", secPerKm: 240 }, recoverySeconds: 120, recoveryKind: "jog" },
      { kind: "cooldown", km: 2 },
    ];
    expect(estimateLabel(steps, "km")).toBe("≈ 11.4 km · 58 min");
    expect(estimateLabel([{ kind: "steady", km: 20 }], "km")).toBe("≈ 20.0 km · 2 h");
  });
});
