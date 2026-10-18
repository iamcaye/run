import { toDisplayDistance, formatDuration, type Units } from "@/lib/units";
import { presetForDistance } from "@/lib/validation/goal";
import type { Goal } from "@/server/dal";
import type { GoalFormDefaults } from "./goal-form";

/** Stored (metric) goal → form defaults in the user's display units. */
export function goalToFormDefaults(goal: Goal, units: Units): GoalFormDefaults {
  const preset = presetForDistance(goal.distanceKm);
  return {
    name: goal.name,
    raceDate: goal.raceDate,
    distancePreset: preset,
    customDistance: preset === "custom" ? trim(toDisplayDistance(goal.distanceKm, units), 2) : "",
    goalType: goal.goalType,
    targetTime: goal.targetTimeSeconds ? formatDuration(goal.targetTimeSeconds) : "",
    startWeeklyDistance: trim(toDisplayDistance(goal.startWeeklyKm, units), 1),
    level: goal.level,
    notes: goal.notes ?? "",
  };
}

function trim(n: number, digits: number): string {
  return String(Number(n.toFixed(digits)));
}
