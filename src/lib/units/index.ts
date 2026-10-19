/** Metric is canonical everywhere; convert only at the display/input boundary. */

export type Units = "km" | "mi";

export const KM_PER_MI = 1.609344;

export function toDisplayDistance(km: number, units: Units): number {
  return units === "mi" ? km / KM_PER_MI : km;
}

export function fromDisplayDistance(value: number, units: Units): number {
  return units === "mi" ? value * KM_PER_MI : value;
}

export function formatDistance(km: number, units: Units, digits = 1): string {
  return `${toDisplayDistance(km, units).toFixed(digits)} ${units}`;
}

/** Bare number for big display figures, dropping a trailing ".0": "12", "10.2". */
export function formatDistanceValue(km: number, units: Units): string {
  const v = Math.round(toDisplayDistance(km, units) * 10) / 10;
  return Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1);
}

/** "4:59 /km" or "8:01 /mi". */
export function formatPace(secPerKm: number, units: Units): string {
  const secPerUnit = units === "mi" ? secPerKm * KM_PER_MI : secPerKm;
  const total = Math.round(secPerUnit);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")} /${units}`;
}

/** "1:45:00", or "45:00" under an hour. */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Parses "h:mm:ss" or "mm:ss" into seconds. Returns null for anything else. */
export function parseDuration(input: string): number | null {
  const parts = input.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const [a = 0, b = 0, c] = nums;
  if (c === undefined) {
    if (b >= 60) return null;
    return a * 60 + b;
  }
  if (b >= 60 || c >= 60) return null;
  return a * 3600 + b * 60 + c;
}
