import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generatePlan } from "@/lib/planning/generate";
import { goalInputArb, settingsArb } from "@/lib/planning/test-arbitraries";
import type { PlanWorkout } from "@/lib/custom-plans/types";
import { z } from "zod";
import { customPlanDocSchema, planMetaSchema, planWorkoutSchema, stepSchema } from "./custom-plan";

const workout = (steps: unknown[], extra: object = {}) => ({
  name: "Intervals",
  type: "intervals",
  notes: null,
  steps,
  ...extra,
});
const reps = (extra: object = {}) => ({ kind: "reps", reps: 6, repKm: 1, recoverySeconds: 90, ...extra });
const week = (id = "w1", days: unknown[] = Array(7).fill(null)) => ({ id, days });

describe("planWorkoutSchema", () => {
  it("accepts the 6x1000 workout", () => {
    const w = workout([
      { kind: "warmup", km: 2 },
      reps({ repKm: 1, target: { kind: "pace", secPerKm: 240 }, recoveryKind: "jog" }),
      { kind: "cooldown", seconds: 600, target: { kind: "rpe", rpe: 3 } },
    ]);
    const parsed = planWorkoutSchema.parse(w);
    const typed: PlanWorkout = parsed;
    expect(typed.steps).toHaveLength(3);
  });

  it("rejects km and seconds together, or neither", () => {
    expect(stepSchema.safeParse({ kind: "warmup", km: 1, seconds: 60 }).success).toBe(false);
    expect(stepSchema.safeParse({ kind: "warmup" }).success).toBe(false);
    expect(stepSchema.safeParse({ kind: "steady", km: 5 }).success).toBe(true);
    expect(stepSchema.safeParse({ kind: "steady", km: 1, seconds: 1 }).success).toBe(false);
  });
  it("enforces exactly one rep measure and one recovery measure", () => {
    expect(stepSchema.safeParse(reps({ repSeconds: 60 })).success).toBe(false);
    expect(stepSchema.safeParse(reps({ repKm: undefined })).success).toBe(false);
    expect(stepSchema.safeParse(reps({ recoveryKm: 0.2 })).success).toBe(false);
    expect(stepSchema.safeParse(reps({ recoverySeconds: undefined, recoveryKm: 0.2 })).success).toBe(true);
    expect(stepSchema.safeParse(reps({ recoverySeconds: undefined })).success).toBe(false);
  });
  it("rejects bad reps, rpe, zone, pace", () => {
    expect(stepSchema.safeParse(reps({ reps: 0 })).success).toBe(false);
    expect(stepSchema.safeParse(reps({ reps: 51 })).success).toBe(false);
    const t = (target: object) => stepSchema.safeParse({ kind: "steady", km: 5, target }).success;
    expect(t({ kind: "rpe", rpe: 11 })).toBe(false);
    expect(t({ kind: "rpe", rpe: 5.5 })).toBe(false);
    expect(t({ kind: "rpe", rpe: 10 })).toBe(true);
    expect(t({ kind: "hr_zone", zone: 6 })).toBe(false);
    expect(t({ kind: "hr_zone", zone: 5 })).toBe(true);
    expect(t({ kind: "pace", secPerKm: 100 })).toBe(false);
    expect(t({ kind: "pace", secPerKm: 901 })).toBe(false);
    expect(t({ kind: "pace", secPerKm: 300 })).toBe(true);
  });
  it("rejects out-of-range measures", () => {
    expect(stepSchema.safeParse({ kind: "steady", km: 0 }).success).toBe(false);
    expect(stepSchema.safeParse({ kind: "steady", km: 101 }).success).toBe(false);
    expect(stepSchema.safeParse({ kind: "steady", seconds: 21_601 }).success).toBe(false);
  });
  it("rejects 0 steps, >30 steps, type rest, long name/notes", () => {
    expect(planWorkoutSchema.safeParse(workout([])).success).toBe(false);
    expect(planWorkoutSchema.safeParse(workout(Array(31).fill({ kind: "steady", km: 1 }))).success).toBe(false);
    expect(planWorkoutSchema.safeParse(workout([{ kind: "steady", km: 1 }], { type: "rest" })).success).toBe(false);
    expect(planWorkoutSchema.safeParse(workout([{ kind: "steady", km: 1 }], { name: "" })).success).toBe(false);
    expect(planWorkoutSchema.safeParse(workout([{ kind: "steady", km: 1 }], { name: "x".repeat(81) })).success).toBe(false);
    expect(planWorkoutSchema.safeParse(workout([{ kind: "steady", km: 1 }], { notes: "x".repeat(501) })).success).toBe(false);
  });
});

describe("customPlanDocSchema", () => {
  it("accepts a valid doc", () => {
    const w = workout([{ kind: "steady", km: 5 }]);
    expect(customPlanDocSchema.safeParse({ weeks: [week("a", [w, null, null, null, null, null, null])] }).success).toBe(true);
  });
  it("rejects 6 day slots, 8 slots, 53 weeks, bad ids", () => {
    expect(customPlanDocSchema.safeParse({ weeks: [week("a", Array(6).fill(null))] }).success).toBe(false);
    expect(customPlanDocSchema.safeParse({ weeks: [week("a", Array(8).fill(null))] }).success).toBe(false);
    expect(customPlanDocSchema.safeParse({ weeks: Array.from({ length: 53 }, (_, i) => week(`w${i}`)) }).success).toBe(false);
    expect(customPlanDocSchema.safeParse({ weeks: Array.from({ length: 52 }, (_, i) => week(`w${i}`)) }).success).toBe(true);
    expect(customPlanDocSchema.safeParse({ weeks: [week("")] }).success).toBe(false);
    expect(customPlanDocSchema.safeParse({ weeks: [week("x".repeat(65))] }).success).toBe(false);
  });
});

describe("planMetaSchema", () => {
  it("validates name and description", () => {
    expect(planMetaSchema.safeParse({ name: "My plan", description: null }).success).toBe(true);
    expect(planMetaSchema.safeParse({ name: "", description: null }).success).toBe(false);
    expect(planMetaSchema.safeParse({ name: "x".repeat(81), description: null }).success).toBe(false);
    expect(planMetaSchema.safeParse({ name: "a", description: "x".repeat(501) }).success).toBe(false);
  });
});

describe("generated plans", () => {
  it("every generated structure parses", () => {
    fc.assert(
      fc.property(goalInputArb, settingsArb, ({ goal, startDate }, settings) => {
        const plan = generatePlan({ goal, settings, startDate });
        for (const s of plan.sessions) {
          if (!s.structure) continue;
          const r = z.array(stepSchema).safeParse(s.structure.steps);
          if (!r.success) throw new Error(JSON.stringify({ steps: s.structure.steps, issues: r.error.issues }));
        }
      }),
      { numRuns: 100 },
    );
  });
});
