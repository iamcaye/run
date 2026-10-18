import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

/** A local calendar date "YYYY-MM-DD" (no time, no zone). */
export type LocalDate = string;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const ISO_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

export const WEEKDAY_LABELS: Readonly<Record<IsoWeekday, { short: string; long: string }>> = {
  1: { short: "Mon", long: "Monday" },
  2: { short: "Tue", long: "Tuesday" },
  3: { short: "Wed", long: "Wednesday" },
  4: { short: "Thu", long: "Thursday" },
  5: { short: "Fri", long: "Friday" },
  6: { short: "Sat", long: "Saturday" },
  7: { short: "Sun", long: "Sunday" },
};

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isLocalDate(value: string): value is LocalDate {
  if (!LOCAL_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today's calendar date in `timeZone`. */
export function todayInTz(timeZone: string, now: Date = new Date()): LocalDate {
  return format(new TZDate(now, timeZone), "yyyy-MM-dd");
}

// Date-only arithmetic is done in UTC so DST never shifts a day.
const toUtc = (d: LocalDate) => new Date(`${d}T00:00:00Z`);
const fromUtc = (d: Date): LocalDate => d.toISOString().slice(0, 10);

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Whole days from `a` to `b` (positive if b is later). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

export function isoWeekday(date: LocalDate): IsoWeekday {
  const js = toUtc(date).getUTCDay(); // 0 = Sunday
  return (js === 0 ? 7 : js) as IsoWeekday;
}

/** Start of the week containing `date`, for a week that starts on `weekStart`. */
export function startOfWeek(date: LocalDate, weekStart: IsoWeekday): LocalDate {
  const offset = (isoWeekday(date) - weekStart + 7) % 7;
  return addDays(date, -offset);
}

/** Time zones for pickers; falls back to a small list on runtimes without `supportedValuesOf`. */
export function listTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  const zones = intl.supportedValuesOf?.("timeZone") ?? [];
  return zones.length > 0 ? zones : ["UTC", "Europe/Madrid", "Europe/London", "America/New_York"];
}
