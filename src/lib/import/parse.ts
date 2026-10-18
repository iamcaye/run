import { TZDate } from "@date-fns/tz";
import { KM_PER_MI } from "@/lib/units";

/**
 * Parses Health Auto Export timestamps. Seen formats:
 *   "2026-10-18 08:02:11 +0200"   (HAE default)
 *   "2026-10-18T08:02:11+02:00" / "...Z"   (ISO)
 *   "2026-10-18 08:02:11"         (no offset → interpreted in `fallbackTimeZone`)
 */
export function parseHaeDate(input: unknown, fallbackTimeZone: string): Date | null {
  if (typeof input === "number" && Number.isFinite(input)) {
    // Epoch seconds or milliseconds.
    return new Date(input < 1e12 ? input * 1000 : input);
  }
  if (typeof input !== "string") return null;
  const s = input.trim();

  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec = "0", frac = "0", zone] = m;
  const ms = Math.round(Number(`0.${frac}`) * 1000);

  if (zone) {
    const offset = zone === "Z" ? "Z" : `${zone.slice(0, 3)}:${zone.slice(-2)}`;
    const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec.padStart(2, "0")}.${String(ms).padStart(3, "0")}${offset}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const local = new TZDate(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec), ms, fallbackTimeZone);
  const date = new Date(local.getTime());
  return Number.isNaN(date.getTime()) ? null : date;
}

const KM_PER_UNIT: Readonly<Record<string, number>> = {
  km: 1,
  kilometer: 1,
  kilometers: 1,
  kilometre: 1,
  kilometres: 1,
  mi: KM_PER_MI,
  mile: KM_PER_MI,
  miles: KM_PER_MI,
  m: 0.001,
  meter: 0.001,
  meters: 0.001,
  metre: 0.001,
  metres: 0.001,
  yd: 0.0009144,
  yards: 0.0009144,
};

/** Distance → km, or null for unknown units. Units default to km when missing. */
export function toKm(qty: unknown, units: unknown): number | null {
  const n = typeof qty === "number" ? qty : typeof qty === "string" ? Number(qty) : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  const key = typeof units === "string" ? units.trim().toLowerCase() : "km";
  const factor = KM_PER_UNIT[key];
  return factor === undefined ? null : n * factor;
}

/** Reads `x`, `{ qty: x }`, `{ avg: x }` or `{ avg: { qty: x } }` style numbers. */
export function readNumber(value: unknown, ...keys: string[]): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value === "object") {
    for (const k of ["qty", ...keys]) {
      const v = (value as Record<string, unknown>)[k];
      const n = readNumber(v);
      if (n !== null) return n;
    }
  }
  return null;
}
