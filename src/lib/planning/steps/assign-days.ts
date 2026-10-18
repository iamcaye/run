import { addDays, daysBetween, isoWeekday, type IsoWeekday, type LocalDate } from "@/lib/time";
import type { PlanSettings } from "../types";
import type { QualityType, WeekTemplate } from "./template";

export type DayRole =
  | { role: "long"; date: LocalDate }
  | { role: "quality"; date: LocalDate; type: QualityType }
  | { role: "easy"; date: LocalDate; strides: boolean }
  | { role: "race"; date: LocalDate };

/** Days of a week usable for runs (the race day is always usable). */
export function runDaysOf(days: readonly LocalDate[], runDays: readonly IsoWeekday[]): LocalDate[] {
  return days.filter((d) => runDays.includes(isoWeekday(d)));
}

/**
 * Long-run date for a week: `longRunDay` if it's in this week's usable days, otherwise the latest
 * usable run day (partial first week). Null when there's no long run or no day for it.
 */
export function pickLongRunDate(input: {
  days: readonly LocalDate[];
  settings: PlanSettings;
  template: WeekTemplate;
}): { date: LocalDate | null; moved: boolean } {
  const { days, settings, template } = input;
  if (!template.long || settings.maxRunsPerWeek < 1) return { date: null, moved: false };
  const usable = runDaysOf(days, settings.runDays);
  const preferred = usable.find((d) => isoWeekday(d) === settings.longRunDay);
  if (preferred) return { date: preferred, moved: false };
  const fallback = usable.at(-1) ?? null;
  return { date: fallback, moved: fallback !== null };
}

const adjacent = (a: LocalDate, b: LocalDate) => Math.abs(daysBetween(a, b)) === 1;

/**
 * Assigns days for one week. Global context (`longDates` for all weeks, `hardDates` so far) lets
 * the spacing rules hold across week boundaries.
 *
 * Priority when days are short: long → quality → easy (easy runs are dropped first).
 * Quality never sits on/next to a long run or next to another hard day; among valid days it goes
 * as far from the long run as possible.
 */
export function assignDays(input: {
  days: readonly LocalDate[];
  settings: PlanSettings;
  template: WeekTemplate;
  longDate: LocalDate | null;
  raceDate: LocalDate | null;
  allLongDates: ReadonlySet<LocalDate>;
  hardDates: ReadonlySet<LocalDate>;
}): { roles: DayRole[]; droppedQuality: number } {
  const { days, settings, template, longDate, raceDate, allLongDates, hardDates } = input;
  const usable = runDaysOf(days, settings.runDays).filter((d) => d !== raceDate);
  const roles: DayRole[] = [];
  const used = new Set<LocalDate>();
  const hard = new Set(hardDates);

  let budget = Math.min(settings.maxRunsPerWeek, usable.length + (raceDate ? 1 : 0));

  if (raceDate) {
    roles.push({ role: "race", date: raceDate });
    used.add(raceDate);
    hard.add(raceDate);
    budget--;
  }
  if (longDate && budget > 0) {
    roles.push({ role: "long", date: longDate });
    used.add(longDate);
    budget--;
  }

  let droppedQuality = 0;
  for (const type of template.quality) {
    if (budget <= 0) break;
    const candidates = usable.filter(
      (d) =>
        !used.has(d) &&
        !allLongDates.has(d) &&
        !allLongDates.has(addDays(d, 1)) &&
        !allLongDates.has(addDays(d, -1)) &&
        ![...hard].some((h) => h === d || adjacent(h, d)),
    );
    const anchors = [...allLongDates, ...hard];
    const best = pickFarthest(candidates, anchors);
    if (!best) {
      droppedQuality++;
      continue;
    }
    roles.push({ role: "quality", date: best, type });
    used.add(best);
    hard.add(best);
    budget--;
  }

  let stridesLeft = template.strides;
  while (budget > 0) {
    const candidates = usable.filter((d) => !used.has(d));
    const best = pickFarthest(candidates, [...used]);
    if (!best) break;
    roles.push({ role: "easy", date: best, strides: stridesLeft });
    stridesLeft = false;
    used.add(best);
    budget--;
  }

  roles.sort((a, b) => a.date.localeCompare(b.date));
  return { roles, droppedQuality };
}

/** Candidate whose nearest anchor is farthest away (ties → earliest date). */
function pickFarthest(candidates: readonly LocalDate[], anchors: readonly LocalDate[]): LocalDate | null {
  let best: LocalDate | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    const score = anchors.length === 0 ? 0 : Math.min(...anchors.map((a) => Math.abs(daysBetween(a, c))));
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}
