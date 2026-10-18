import { PLANNING, type DistanceKey } from "@/config/training";
import type { Phase } from "../types";

export const roundTo = (km: number, step: number = PLANNING.roundingKm) => Math.round(km / step) * step;
export const floorTo = (km: number, step: number = PLANNING.roundingKm) =>
  Math.floor(km / step + 1e-9) * step;

export type VolumeCurve = {
  targets: number[];
  isDeload: boolean[];
  /** Highest weekly target actually reached before the taper. */
  peakKm: number;
};

/**
 * Weekly km targets:
 * - maintenance weeks hold the starting volume;
 * - core weeks progress ≤10% over the last non-deload week (rounded down, capped at the table peak),
 *   in 3:1 cycles with a deload at ~78%, except in the last cycle before the taper;
 * - taper/race weeks are fixed fractions of the peak reached.
 */
export function buildVolumeCurve(input: {
  phases: readonly Phase[];
  maintenanceWeeks: number;
  startWeeklyKm: number;
  tablePeakKm: number;
  distanceKey: DistanceKey;
}): VolumeCurve {
  const { phases, maintenanceWeeks, startWeeklyKm, tablePeakKm, distanceKey } = input;
  const { cycleLength, fraction: deloadFraction } = PLANNING.deload;

  const start = Math.min(roundTo(Math.max(startWeeklyKm, PLANNING.minStartWeeklyKm)), tablePeakKm);
  const targets: number[] = [];
  const isDeload: boolean[] = [];

  const taperStart = phases.findIndex((p) => p === "taper" || p === "race");
  const coreEnd = taperStart === -1 ? phases.length : taperStart;
  const coreLen = coreEnd - maintenanceWeeks;

  let ref = start;
  for (let w = 0; w < coreEnd; w++) {
    if (w < maintenanceWeeks) {
      targets.push(start);
      isDeload.push(false);
      continue;
    }
    const i = w - maintenanceWeeks;
    const deload = (i + 1) % cycleLength === 0 && i < coreLen - cycleLength;
    if (deload) {
      targets.push(roundTo(ref * deloadFraction));
      isDeload.push(true);
      continue;
    }
    const isFirstWeek = w === 0;
    const next = isFirstWeek ? start : Math.min(tablePeakKm, Math.max(ref, floorTo(ref * (1 + PLANNING.maxWeeklyIncrease))));
    targets.push(next);
    isDeload.push(false);
    ref = next;
  }

  const peakKm = targets.length > 0 ? Math.max(...targets) : start;

  const fractions = PLANNING.taperFractions[distanceKey];
  const taperWeeks = phases.length - coreEnd;
  const usedFractions = fractions.slice(fractions.length - taperWeeks);
  for (const f of usedFractions) {
    targets.push(roundTo(peakKm * f));
    isDeload.push(false);
  }

  return { targets, isDeload, peakKm };
}
