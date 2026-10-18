import { describe, expect, it } from "vitest";
import {
  availabilityChanged,
  canActivate,
  canLogResult,
  goalChangesAffectingPlan,
  needsResultPrompt,
  type GoalPlanFields,
} from "./rules";

const today = "2026-10-18";

describe("goal status rules", () => {
  it("activation", () => {
    expect(canActivate({ status: "upcoming", raceDate: "2027-01-01" })).toBe(true);
    expect(canActivate({ status: "abandoned", raceDate: "2027-01-01" })).toBe(true);
    expect(canActivate({ status: "completed", raceDate: "2026-01-01" })).toBe(false);
    expect(canActivate({ status: "active", raceDate: "2027-01-01" })).toBe(false);
  });

  it("results can be logged from race day on", () => {
    expect(canLogResult({ status: "active", raceDate: today }, today)).toBe(true);
    expect(canLogResult({ status: "active", raceDate: "2026-10-19" }, today)).toBe(false);
    expect(canLogResult({ status: "completed", raceDate: "2026-10-01" }, today)).toBe(false);
  });

  it("prompts for a result only after race day", () => {
    expect(needsResultPrompt({ status: "active", raceDate: "2026-10-17" }, today)).toBe(true);
    expect(needsResultPrompt({ status: "active", raceDate: today }, today)).toBe(false);
    expect(needsResultPrompt({ status: "abandoned", raceDate: "2026-10-01" }, today)).toBe(false);
  });
});

describe("plan-affecting changes", () => {
  const base: GoalPlanFields = {
    raceDate: "2027-03-07",
    distanceKm: 21.0975,
    goalType: "target_time",
    targetTimeSeconds: 6300,
    startWeeklyKm: 30,
    level: "intermediate",
  };

  it("detects date and target changes, ignores identical values", () => {
    expect(goalChangesAffectingPlan(base, { ...base })).toEqual([]);
    expect(goalChangesAffectingPlan(base, { ...base, raceDate: "2027-03-14", targetTimeSeconds: 6200 })).toEqual([
      "raceDate",
      "targetTimeSeconds",
    ]);
  });

  it("availability comparison ignores run-day order", () => {
    const a = { weekStart: 1, runDays: [2, 4, 7], longRunDay: 7, maxRunsPerWeek: 3 };
    expect(availabilityChanged(a, { ...a, runDays: [7, 2, 4] })).toBe(false);
    expect(availabilityChanged(a, { ...a, runDays: [2, 4, 6] })).toBe(true);
    expect(availabilityChanged(a, { ...a, maxRunsPerWeek: 2 })).toBe(true);
  });
});
