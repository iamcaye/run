import { describe, expect, it } from "vitest";
import { estimateWorkout } from "./estimate";

describe("estimateWorkout", () => {
  it("estimates the 6×1000 example", () => {
    const e = estimateWorkout([
      { kind: "warmup", km: 2 },
      { kind: "reps", reps: 6, repKm: 1, target: { kind: "pace", secPerKm: 240 }, recoverySeconds: 120, recoveryKind: "jog" },
      { kind: "cooldown", km: 2 },
    ]);
    expect(e.km).toBeCloseTo(4 + 6 + (5 * 120) / 420, 1);
    expect(e.seconds).toBe(4 * 360 + 6 * 240 + 5 * 120);
  });
  it("stand recovery adds time but no distance", () => {
    const e = estimateWorkout([
      { kind: "reps", reps: 3, repKm: 1, target: { kind: "pace", secPerKm: 300 }, recoverySeconds: 60, recoveryKind: "stand" },
    ]);
    expect(e.km).toBe(3);
    expect(e.seconds).toBe(3 * 300 + 2 * 60);
  });
  it("time-based steady at Z3 converts with secPerKmByZone[3]", () => {
    const e = estimateWorkout([{ kind: "steady", seconds: 1260, target: { kind: "hr_zone", zone: 3 } }]);
    expect(e.km).toBeCloseTo(1260 / 315, 5);
    expect(e.seconds).toBe(1260);
  });
  it("maps RPE and legacy steps", () => {
    expect(estimateWorkout([{ kind: "steady", km: 1, target: { kind: "rpe", rpe: 7 } }]).seconds).toBe(300);
    expect(estimateWorkout([{ kind: "steady", km: 1, paceSecPerKm: 250, zone: "tempo" }]).seconds).toBe(250);
    expect(estimateWorkout([{ kind: "reps", reps: 2, repKm: 1, zone: "intervals" }]).seconds).toBe(570);
    expect(estimateWorkout([{ kind: "steady", km: 10, zone: "long" }]).seconds).toBe(3600);
  });
});
