import { METRICS } from "@/config/training";
import { addDays, type LocalDate } from "@/lib/time";

export type DailyLoad = { date: LocalDate; load: number };

export type AcwrPoint = {
  date: LocalDate;
  acute: number;
  /** Average weekly load over the chronic window (28-day sum / 4). */
  chronic: number;
  ratio: number | null;
  flag: "high" | "low" | "ok" | null;
  /** Less than a full chronic window of history: the ratio is unreliable (inflated). */
  insufficientHistory: boolean;
};

/** Sums loads per local date. */
export function dailyLoads(items: readonly { date: LocalDate; load: number }[]): Map<LocalDate, number> {
  const out = new Map<LocalDate, number>();
  for (const { date, load } of items) out.set(date, (out.get(date) ?? 0) + load);
  return out;
}

/**
 * Acute:chronic workload ratio on `date`: 7-day acute sum ÷ (28-day sum / 4), both windows
 * ending on and including `date`. Flags > 1.5 (high) and < 0.8 (low).
 */
export function acwrOn(
  date: LocalDate,
  loads: ReadonlyMap<LocalDate, number>,
  firstActivityDate: LocalDate | null,
): AcwrPoint {
  let acute = 0;
  let chronicSum = 0;
  for (let i = 0; i < METRICS.chronicDays; i++) {
    const l = loads.get(addDays(date, -i)) ?? 0;
    chronicSum += l;
    if (i < METRICS.acuteDays) acute += l;
  }
  const chronic = chronicSum / (METRICS.chronicDays / METRICS.acuteDays);
  const ratio = chronic > 0 ? acute / chronic : null;
  const flag = ratio === null ? null : ratio > METRICS.acwr.high ? "high" : ratio < METRICS.acwr.low ? "low" : "ok";
  const windowStart = addDays(date, -(METRICS.chronicDays - 1));
  return {
    date,
    acute,
    chronic,
    ratio,
    flag,
    insufficientHistory: firstActivityDate === null || firstActivityDate > windowStart,
  };
}

/** ACWR for each day from `from` to `to` (inclusive). */
export function acwrSeries(
  from: LocalDate,
  to: LocalDate,
  loads: ReadonlyMap<LocalDate, number>,
): AcwrPoint[] {
  const first = [...loads.keys()].sort()[0] ?? null;
  const out: AcwrPoint[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(acwrOn(d, loads, first));
  return out;
}
