import { PLANNING, type DistanceKey } from "@/config/training";
import type { Phase } from "../types";

type CorePhase = "base" | "build" | "specific";
const CORE: readonly CorePhase[] = ["base", "build", "specific"];

/**
 * Phase per week. Layout: [maintenance base…][base…][build…][specific…][taper…][race].
 * The taper count includes race week. Compressed plans lose base first, then build.
 */
export function allocatePhases(input: {
  weekCount: number;
  maintenanceWeeks: number;
  distanceKey: DistanceKey;
  startWeeklyKm: number;
  tablePeakKm: number;
}): Phase[] {
  const { weekCount, maintenanceWeeks, distanceKey, startWeeklyKm, tablePeakKm } = input;
  if (weekCount <= 0) return [];

  const taperLen = PLANNING.taperFractions[distanceKey].length;
  if (weekCount <= taperLen) {
    // Only room for (the end of) the taper.
    return [...Array<Phase>(weekCount - 1).fill("taper"), "race"];
  }

  const split = { ...PLANNING.phaseSplit };
  const { belowPeakFraction, shift } = PLANNING.lowVolumeBaseShift;
  if (startWeeklyKm < belowPeakFraction * tablePeakKm) {
    split.base += shift;
    split.build -= shift;
  }

  const coreLen = weekCount - maintenanceWeeks - taperLen;
  const minCoreLen = PLANNING.minWeeks[distanceKey] - taperLen;
  const counts =
    coreLen >= minCoreLen ? splitWeeks(coreLen, split) : compress(splitWeeks(minCoreLen, split), minCoreLen - coreLen);

  return [
    ...Array<Phase>(maintenanceWeeks).fill("base"),
    ...CORE.flatMap((p) => Array<Phase>(counts[p]).fill(p)),
    ...Array<Phase>(taperLen - 1).fill("taper"),
    "race",
  ];
}

/** Largest-remainder split so counts sum exactly to `n`. */
function splitWeeks(n: number, split: Record<CorePhase, number>): Record<CorePhase, number> {
  const raw = CORE.map((p) => ({ p, v: n * split[p] }));
  const counts = Object.fromEntries(raw.map(({ p, v }) => [p, Math.floor(v)])) as Record<CorePhase, number>;
  let left = n - CORE.reduce((s, p) => s + counts[p], 0);
  // Ties favour later phases (specific work matters most close to the race).
  const order = [...raw].sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)) || CORE.indexOf(b.p) - CORE.indexOf(a.p));
  for (const { p } of order) {
    if (left-- <= 0) break;
    counts[p] += 1;
  }
  return counts;
}

function compress(counts: Record<CorePhase, number>, remove: number): Record<CorePhase, number> {
  const out = { ...counts };
  for (const p of CORE) {
    const take = Math.min(out[p], remove);
    out[p] -= take;
    remove -= take;
  }
  return out;
}
