import { describe, expect, it } from "vitest";
import { describeStep } from "./describe";

describe("describeStep", () => {
  it("describes time-based and targeted blocks", () => {
    expect(describeStep({ kind: "warmup", seconds: 600 }, "km")).toBe("10 min warm-up, easy");
    expect(
      describeStep({ kind: "reps", reps: 6, repKm: 1, target: { kind: "pace", secPerKm: 240 }, recoverySeconds: 120, recoveryKind: "jog" }, "km"),
    ).toBe("6 × 1.0 km @ 4:00 /km, 2:00 jog between");
    expect(describeStep({ kind: "steady", seconds: 1200, target: { kind: "hr_zone", zone: 3 } }, "km")).toBe("20 min @ Z3");
    expect(
      describeStep({ kind: "reps", reps: 8, repSeconds: 60, target: { kind: "rpe", rpe: 8 }, recoveryKm: 0.2, recoveryKind: "walk" }, "km"),
    ).toBe("8 × 1:00 @ RPE 8, 0.2 km walk between");
  });
  it("keeps generated-plan strings byte-identical", () => {
    expect(describeStep({ kind: "reps", reps: 6, repKm: 0.8, paceSecPerKm: 250, recoverySeconds: 90 }, "km")).toBe(
      "6 × 0.80 km @ 4:10 /km, 90 s easy between",
    );
    expect(describeStep({ kind: "reps", reps: 6, repSeconds: 20, recoverySeconds: 60, effort: "RPE 7" }, "km")).toBe(
      "6 × 20 s, 60 s easy between — RPE 7",
    );
  });
});
