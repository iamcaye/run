import fc from "fast-check";
import { DISTANCE_PRESETS_KM, LEVELS } from "@/config/training";
import { addDays, type IsoWeekday } from "@/lib/time";
import type { PlanGoal, PlanSettings } from "./types";

export const settingsArb: fc.Arbitrary<PlanSettings> = fc
  .record({
    weekStart: fc.integer({ min: 1, max: 7 }),
    runDays: fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { minLength: 1, maxLength: 7 }),
    longPick: fc.nat(),
    maxPick: fc.nat(),
  })
  .map(({ weekStart, runDays, longPick, maxPick }) => {
    const days = [...runDays].sort((a, b) => a - b) as IsoWeekday[];
    return {
      weekStart: weekStart as IsoWeekday,
      runDays: days,
      longRunDay: days[longPick % days.length] as IsoWeekday,
      maxRunsPerWeek: (maxPick % days.length) + 1,
    };
  });

const distanceArb = fc.oneof(
  fc.constantFrom(...Object.values(DISTANCE_PRESETS_KM)),
  fc.double({ min: 3, max: 50, noNaN: true }).map((d) => Math.round(d * 10) / 10),
);

export const goalInputArb = fc
  .record({
    startDate: fc
      .date({ min: new Date("2026-01-01T00:00:00Z"), max: new Date("2028-12-31T00:00:00Z"), noInvalidDate: true })
      .map((d) => d.toISOString().slice(0, 10)),
    leadDays: fc.integer({ min: 1, max: 260 }),
    distanceKm: distanceArb,
    level: fc.constantFrom(...LEVELS),
    startWeeklyKm: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 120, noNaN: true })),
    targetPace: fc.option(fc.integer({ min: 180, max: 480 }), { nil: null }),
  })
  .map(({ startDate, leadDays, distanceKm, level, startWeeklyKm, targetPace }) => {
    const goal: PlanGoal = {
      raceDate: addDays(startDate, leadDays),
      distanceKm,
      goalType: targetPace ? "target_time" : "finish",
      targetTimeSeconds: targetPace ? Math.round(targetPace * distanceKm) : null,
      startWeeklyKm: Math.round(startWeeklyKm * 2) / 2,
      level,
    };
    return { goal, startDate };
  });
