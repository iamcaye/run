import { METRICS } from "@/config/training";
import type { HrSample } from "@/lib/import/types";
import type { HrSettings } from "./types";

export type HrZone = { zone: number; minBpm: number; maxBpm: number };

/** Karvonen zones: bpm = rest + fraction × (max − rest). Null without HR settings. */
export function hrZones(hr: HrSettings): HrZone[] | null {
  const { maxHr, restHr } = hr;
  if (maxHr === null || restHr === null || maxHr <= restHr) return null;
  const reserve = maxHr - restHr;
  const bounds = METRICS.hrZoneBounds;
  return bounds.map((lower, i) => ({
    zone: i + 1,
    minBpm: Math.round(restHr + lower * reserve),
    maxBpm: i + 1 < bounds.length ? Math.round(restHr + (bounds[i + 1] ?? 1) * reserve) : maxHr,
  }));
}

/**
 * Seconds spent in each zone (index 0 = below Z1). Each sample counts until the next one
 * (the last until the end of the activity), capped so gaps don't inflate a zone.
 */
export function timeInZones(samples: readonly HrSample[], totalSeconds: number, zones: readonly HrZone[]): number[] {
  const out = Array<number>(zones.length + 1).fill(0);
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  sorted.forEach((s, i) => {
    const next = sorted[i + 1]?.t ?? totalSeconds;
    const duration = Math.max(0, Math.min(next - s.t, METRICS.hrMaxSampleGapSeconds));
    let idx = 0;
    for (const z of zones) if (s.bpm >= z.minBpm) idx = z.zone;
    out[idx] = (out[idx] ?? 0) + duration;
  });
  return out;
}
