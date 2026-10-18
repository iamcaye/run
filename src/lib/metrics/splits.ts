export type TrackPoint = { lat: number; lon: number; timestamp: Date | null };

export type Split = {
  /** 1-based split number. */
  index: number;
  /** Split length in km (1, except a shorter final split). */
  km: number;
  seconds: number;
  paceSecPerKm: number;
};

const EARTH_RADIUS_KM = 6371.0088;

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Per-kilometre splits from a timestamped GPS track, interpolating the moment each kilometre is
 * crossed. GPS distance drifts from the watch's total, so it's rescaled to `totalKm` when given.
 * A final partial split is included if it's at least `minLastKm` long.
 */
export function computeSplits(points: readonly TrackPoint[], opts: { totalKm?: number; minLastKm?: number } = {}): Split[] {
  const timed = points.filter((p): p is TrackPoint & { timestamp: Date } => p.timestamp !== null);
  if (timed.length < 2) return [];

  const cumulative = [0];
  for (let i = 1; i < timed.length; i++) {
    cumulative.push((cumulative[i - 1] ?? 0) + haversineKm(timed[i - 1] as TrackPoint, timed[i] as TrackPoint));
  }
  const gpsTotal = cumulative.at(-1) ?? 0;
  if (gpsTotal <= 0) return [];
  const scale = opts.totalKm && opts.totalKm > 0 ? opts.totalKm / gpsTotal : 1;
  const dist = cumulative.map((d) => d * scale);
  const t0 = (timed[0] as { timestamp: Date }).timestamp.getTime();
  const time = timed.map((p) => (p.timestamp.getTime() - t0) / 1000);
  const total = dist.at(-1) ?? 0;

  /** Seconds at which distance `d` is reached (linear interpolation). */
  const timeAt = (d: number): number => {
    let i = 1;
    while (i < dist.length && (dist[i] ?? 0) < d) i++;
    if (i >= dist.length) return time.at(-1) ?? 0;
    const d0 = dist[i - 1] ?? 0;
    const d1 = dist[i] ?? 0;
    const f = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
    return (time[i - 1] ?? 0) + f * ((time[i] ?? 0) - (time[i - 1] ?? 0));
  };

  const splits: Split[] = [];
  let prevT = 0;
  for (let k = 1; k <= Math.floor(total + 1e-9); k++) {
    const t = timeAt(k);
    splits.push({ index: k, km: 1, seconds: t - prevT, paceSecPerKm: t - prevT });
    prevT = t;
  }
  const rest = total - Math.floor(total + 1e-9);
  if (rest >= (opts.minLastKm ?? 0.1)) {
    const seconds = (time.at(-1) ?? 0) - prevT;
    splits.push({ index: splits.length + 1, km: rest, seconds, paceSecPerKm: seconds / rest });
  }
  return splits.map((s) => ({ ...s, seconds: Math.round(s.seconds), paceSecPerKm: Math.round(s.paceSecPerKm) }));
}
