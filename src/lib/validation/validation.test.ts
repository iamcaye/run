import { describe, expect, it } from "vitest";
import { goalFormSchema, presetForDistance } from "./goal";
import { availabilitySchema, heartRateSchema, preferencesSchema } from "./settings";

const ctx = { today: "2026-10-18", units: "km" as const, requireFutureDate: true };

const validGoal = {
  name: "Spring Half",
  raceDate: "2027-03-07",
  distancePreset: "half",
  customDistance: "",
  goalType: "target_time",
  targetTime: "1:45:00",
  startWeeklyDistance: "30",
  level: "intermediate",
  notes: "",
};

describe("goalFormSchema", () => {
  it("parses a valid target-time goal into metric values", () => {
    const r = goalFormSchema(ctx).parse(validGoal);
    expect(r).toEqual({
      name: "Spring Half",
      raceDate: "2027-03-07",
      distanceKm: 21.0975,
      goalType: "target_time",
      targetTimeSeconds: 6300,
      startWeeklyKm: 30,
      level: "intermediate",
      notes: null,
    });
  });

  it("drops the target time for finish goals", () => {
    const r = goalFormSchema(ctx).parse({ ...validGoal, goalType: "finish", targetTime: "1:45:00" });
    expect(r.targetTimeSeconds).toBeNull();
  });

  it("converts custom distances and weekly volume from miles", () => {
    const r = goalFormSchema({ ...ctx, units: "mi" }).parse({
      ...validGoal,
      distancePreset: "custom",
      customDistance: "10",
      startWeeklyDistance: "20",
    });
    expect(r.distanceKm).toBeCloseTo(16.093, 3);
    expect(r.startWeeklyKm).toBeCloseTo(32.2, 1);
  });

  it("reports field errors", () => {
    const r = goalFormSchema(ctx).safeParse({
      ...validGoal,
      raceDate: "2026-10-18",
      distancePreset: "custom",
      targetTime: "1:75",
    });
    expect(r.success).toBe(false);
    const paths = r.error?.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["raceDate", "customDistance", "targetTime"]));
  });

  it("allows past dates when editing", () => {
    const r = goalFormSchema({ ...ctx, requireFutureDate: false }).safeParse({
      ...validGoal,
      raceDate: "2026-01-01",
    });
    expect(r.success).toBe(true);
  });

  it("presetForDistance", () => {
    expect(presetForDistance(21.0975)).toBe("half");
    expect(presetForDistance(15)).toBe("custom");
  });
});

describe("settings schemas", () => {
  it("availability: long run day must be a run day; max runs ≤ run days", () => {
    const ok = availabilitySchema.parse({ runDays: ["7", "2", "4", "2"], longRunDay: "7", maxRunsPerWeek: "3" });
    expect(ok.runDays).toEqual([2, 4, 7]);

    const bad = availabilitySchema.safeParse({ runDays: ["2", "4"], longRunDay: "7", maxRunsPerWeek: "3" });
    expect(bad.error?.issues.map((i) => i.path[0])).toEqual(["longRunDay", "maxRunsPerWeek"]);
  });

  it("heart rate: both or neither, rest < max", () => {
    expect(heartRateSchema.parse({ maxHr: "", restHr: "" })).toEqual({ maxHr: null, restHr: null });
    expect(heartRateSchema.safeParse({ maxHr: "185", restHr: "" }).success).toBe(false);
    expect(heartRateSchema.safeParse({ maxHr: "150", restHr: "160" }).success).toBe(false);
    expect(heartRateSchema.parse({ maxHr: "188", restHr: "52" })).toEqual({ maxHr: 188, restHr: 52 });
  });

  it("preferences: validates time zone", () => {
    expect(preferencesSchema.safeParse({ timezone: "Europe/Madrid", units: "mi", weekStart: "1" }).success).toBe(true);
    expect(preferencesSchema.safeParse({ timezone: "Nowhere/Land", units: "km", weekStart: "1" }).success).toBe(false);
  });
});
