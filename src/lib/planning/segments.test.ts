import { describe, expect, it } from "vitest";
import { structureSegments } from "./segments";

describe("structureSegments", () => {
  it("lays out warm-up, reps with recoveries between them, and cool-down", () => {
    const segs = structureSegments([
      { kind: "warmup", km: 2 },
      { kind: "reps", reps: 3, repKm: 1, recoverySeconds: 90 },
      { kind: "cooldown", km: 2 },
    ]);
    expect(segs.map((s) => s.work)).toEqual([false, true, false, true, false, true, false]);
    expect(segs[2]!.weight).toBeCloseTo(90 / 360);
  });

  it("treats easy and long steady blocks as easy, faster zones as work", () => {
    const segs = structureSegments([
      { kind: "steady", km: 14, zone: "long" },
      { kind: "steady", km: 4, zone: "race_pace" },
      { kind: "steady", km: 6, zone: "easy" },
    ]);
    expect(segs.map((s) => s.work)).toEqual([false, true, false]);
  });

  it("sizes time-based reps and drops empty blocks", () => {
    const segs = structureSegments([
      { kind: "warmup", km: 0 },
      { kind: "reps", reps: 1, repSeconds: 120, recoverySeconds: 60 },
    ]);
    expect(segs).toEqual([{ weight: 0.5, work: true }]);
  });
});

describe("structureSegments custom blocks", () => {
  it("weights time-based blocks and distance recoveries", () => {
    const segs = structureSegments([
      { kind: "warmup", seconds: 600 },
      { kind: "reps", reps: 2, repSeconds: 240, recoveryKm: 0.2, recoveryKind: "jog" },
    ]);
    expect(segs.map((s) => s.work)).toEqual([false, true, false, true]);
    expect(segs[0]!.weight).toBeCloseTo(600 / 360);
    expect(segs[2]!.weight).toBeCloseTo(0.2);
  });
  it("treats a steady block with an RPE >= 6 or zone >= 3 target as work", () => {
    expect(structureSegments([{ kind: "steady", km: 3, target: { kind: "rpe", rpe: 7 } }])[0]!.work).toBe(true);
    expect(structureSegments([{ kind: "steady", km: 3, target: { kind: "hr_zone", zone: 2 } }])[0]!.work).toBe(false);
  });
});
