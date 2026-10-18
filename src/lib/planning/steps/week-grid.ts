import { PLANNING, type DistanceKey } from "@/config/training";
import { addDays, daysBetween, startOfWeek, type IsoWeekday, type LocalDate } from "@/lib/time";
import type { PlanWarning } from "../types";

export type GridWeek = {
  index: number;
  start: LocalDate;
  /** Usable dates: ≥ startDate and ≤ raceDate. */
  days: LocalDate[];
  isPartial: boolean;
};

export type WeekGrid = {
  weeks: GridWeek[];
  /** Weeks before the core plan that become a `base` maintenance block (lead time > maxCoreWeeks). */
  maintenanceWeeks: number;
  compressed: boolean;
  warnings: PlanWarning[];
};

/**
 * Weeks from the one containing `startDate` to the one containing `raceDate`, aligned to
 * `weekStart`. Race week is always last.
 */
export function buildWeekGrid(input: {
  startDate: LocalDate;
  raceDate: LocalDate;
  weekStart: IsoWeekday;
  distanceKey: DistanceKey;
}): WeekGrid {
  const { startDate, raceDate, weekStart, distanceKey } = input;
  if (raceDate <= startDate) {
    return { weeks: [], maintenanceWeeks: 0, compressed: false, warnings: [{ code: "race_not_in_future" }] };
  }

  const firstStart = startOfWeek(startDate, weekStart);
  const raceWeekStart = startOfWeek(raceDate, weekStart);
  const count = daysBetween(firstStart, raceWeekStart) / 7 + 1;

  const weeks: GridWeek[] = Array.from({ length: count }, (_, index) => {
    const start = addDays(firstStart, index * 7);
    const days = Array.from({ length: 7 }, (_, d) => addDays(start, d)).filter(
      (d) => d >= startDate && d <= raceDate,
    );
    return { index, start, days, isPartial: index === 0 && start < startDate };
  });

  const warnings: PlanWarning[] = [];
  const minWeeks = PLANNING.minWeeks[distanceKey];
  const compressed = count < minWeeks;
  if (compressed) warnings.push({ code: "compressed", weeks: count, recommendedWeeks: minWeeks });

  return {
    weeks,
    maintenanceWeeks: Math.max(0, count - PLANNING.maxCoreWeeks),
    compressed,
    warnings,
  };
}
