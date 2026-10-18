import { startOfWeek, type IsoWeekday, type LocalDate } from "@/lib/time";
import type { MetricActivity, MetricSession } from "./types";

export type WeekVolume = {
  weekStart: LocalDate;
  plannedKm: number;
  /** Planned km for sessions up to `asOf` — what compliance is measured against. */
  plannedToDateKm: number;
  /** Everything run that week, planned or not. */
  actualKm: number;
  /** Σ min(linked activity km, session target) over sessions up to `asOf`. */
  completedKm: number;
  /** completedKm / plannedToDateKm, or null when nothing was due yet. */
  compliance: number | null;
};

/**
 * Planned vs actual volume per week (weeks aligned to `weekStart`, dates already local).
 * Running long on one day never hides a missed session: each session's credit is capped at its target.
 */
export function weeklyVolume(input: {
  sessions: readonly MetricSession[];
  activities: readonly MetricActivity[];
  weekStart: IsoWeekday;
  asOf: LocalDate;
}): WeekVolume[] {
  const { sessions, activities, weekStart, asOf } = input;
  const weeks = new Map<LocalDate, WeekVolume>();
  const week = (date: LocalDate) => {
    const key = startOfWeek(date, weekStart);
    let w = weeks.get(key);
    if (!w) {
      w = { weekStart: key, plannedKm: 0, plannedToDateKm: 0, actualKm: 0, completedKm: 0, compliance: null };
      weeks.set(key, w);
    }
    return w;
  };

  const linkedKm = new Map<string, number>();
  for (const a of activities) {
    week(a.localDate).actualKm += a.km;
    if (a.plannedSessionId) linkedKm.set(a.plannedSessionId, (linkedKm.get(a.plannedSessionId) ?? 0) + a.km);
  }
  for (const s of sessions) {
    if (s.type === "rest") continue;
    const w = week(s.date);
    w.plannedKm += s.targetKm;
    if (s.date <= asOf) {
      w.plannedToDateKm += s.targetKm;
      w.completedKm += Math.min(linkedKm.get(s.id) ?? 0, s.targetKm);
    }
  }
  for (const w of weeks.values()) {
    w.compliance = w.plannedToDateKm > 0 ? w.completedKm / w.plannedToDateKm : null;
  }
  return [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export type SessionStatus = "done" | "missed" | "today" | "upcoming" | "rest";

export function sessionStatus(session: Pick<MetricSession, "date" | "type">, today: LocalDate, completed: boolean): SessionStatus {
  if (session.type === "rest") return "rest";
  if (completed) return "done";
  if (session.date < today) return "missed";
  return session.date === today ? "today" : "upcoming";
}

export type LongRunPoint = { date: LocalDate; plannedKm: number; actualKm: number | null };

/** Planned long runs (and the race) with what was actually run on them. */
export function longRunProgression(
  sessions: readonly MetricSession[],
  activities: readonly MetricActivity[],
): LongRunPoint[] {
  const linked = new Map<string, number>();
  for (const a of activities) if (a.plannedSessionId) linked.set(a.plannedSessionId, (linked.get(a.plannedSessionId) ?? 0) + a.km);
  return sessions
    .filter((s) => s.type === "long")
    .map((s) => ({ date: s.date, plannedKm: s.targetKm, actualKm: linked.get(s.id) ?? null }));
}
