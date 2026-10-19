import { weeklyVolume, sessionStatus, type SessionStatus } from "@/lib/metrics/volume";
import type { MetricActivity } from "@/lib/metrics/types";
import { QUALITY_TYPES } from "@/lib/planning/describe";
import type { Phase } from "@/lib/planning/types";
import { addDays, startOfWeek, type IsoWeekday, type LocalDate } from "@/lib/time";
import type { PlannedSession } from "@/server/dal";

export type YearMonth = string; // "YYYY-MM"

export type CalendarSession = {
  id: string;
  type: PlannedSession["type"];
  targetKm: number;
  status: SessionStatus;
  structure: PlannedSession["structure"];
};
export type CalendarRun = { id: string; km: number };
export type CalendarDay = {
  date: LocalDate;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isRace: boolean;
  emphasis: "quality" | "long" | "none";
  sessions: CalendarSession[];
  unlinkedRuns: CalendarRun[];
};
export type CalendarWeek = {
  start: LocalDate;
  days: CalendarDay[];
  plan: { number: number; phase: Phase; plannedKm: number; actualKm: number; isCurrent: boolean } | null;
};
export type MonthGrid = { month: YearMonth; weeks: CalendarWeek[]; prev: YearMonth | null; next: YearMonth | null };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const monthOf = (date: LocalDate): YearMonth => date.slice(0, 7);

function shiftMonth(month: YearMonth, delta: number): YearMonth {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Resolve the `?month=` param: valid and inside the plan's months → as is; otherwise today's month clamped to [first, last] plan month. */
export function resolveMonth(param: string | undefined, today: LocalDate, sessions: readonly Pick<PlannedSession, "date">[]): YearMonth {
  if (sessions.length === 0) return param && MONTH_RE.test(param) ? param : monthOf(today);
  const dates = sessions.map((s) => s.date);
  const first = monthOf(dates.reduce((a, b) => (a < b ? a : b)));
  const last = monthOf(dates.reduce((a, b) => (a > b ? a : b)));
  if (param && MONTH_RE.test(param) && param >= first && param <= last) return param;
  const current = monthOf(today);
  return current < first ? first : current > last ? last : current;
}

/** Inclusive local-date range the grid covers (whole weeks around the month). */
export function gridRange(month: YearMonth, weekStart: IsoWeekday): { from: LocalDate; to: LocalDate } {
  const firstDay = `${month}-01`;
  const lastDay = addDays(`${shiftMonth(month, 1)}-01`, -1);
  return { from: startOfWeek(firstDay, weekStart), to: addDays(startOfWeek(lastDay, weekStart), 6) };
}

export function buildMonthGrid(input: {
  month: YearMonth;
  weekStart: IsoWeekday;
  today: LocalDate;
  sessions: readonly Pick<PlannedSession, "id" | "date" | "type" | "targetKm" | "phase" | "structure">[];
  activities: readonly Pick<MetricActivity, "id" | "localDate" | "km" | "plannedSessionId">[];
}): MonthGrid {
  const { month, weekStart, today, sessions, activities } = input;
  const { from, to } = gridRange(month, weekStart);

  const completed = new Set<string>();
  const activitiesByDate = new Map<LocalDate, typeof activities[number][]>();
  for (const act of activities) {
    if (act.plannedSessionId) completed.add(act.plannedSessionId);
    const list = activitiesByDate.get(act.localDate) ?? [];
    list.push(act);
    activitiesByDate.set(act.localDate, list);
  }
  const sessionsByDate = new Map<LocalDate, typeof sessions[number][]>();
  for (const s of sessions) {
    const list = sessionsByDate.get(s.date) ?? [];
    list.push(s);
    sessionsByDate.set(s.date, list);
  }

  // Plan week numbering: index among all distinct session weeks (matches "Week {i+1}" on the plan page).
  const planWeeks = [...new Set(sessions.map((s) => startOfWeek(s.date, weekStart)))].sort();
  const volume = new Map(
    weeklyVolume({
      sessions,
      activities: activities.map((a) => ({ ...a, seconds: 0, rpe: null, avgHr: null, hrSeries: null })),
      weekStart,
      asOf: today,
    }).map((w) => [w.weekStart, w]),
  );
  const currentWeek = startOfWeek(today, weekStart);

  const weeks: CalendarWeek[] = [];
  for (let start = from; start <= to; start = addDays(start, 7)) {
    const days: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, i);
      const daySessions = sessionsByDate.get(date) ?? [];
      const ids = new Set(daySessions.map((s) => s.id));
      days.push({
        date,
        inMonth: monthOf(date) === month,
        isToday: date === today,
        isPast: date < today,
        isRace: daySessions.some((s) => s.type === "race"),
        emphasis: daySessions.some((s) => QUALITY_TYPES.has(s.type))
          ? "quality"
          : daySessions.some((s) => s.type === "long")
            ? "long"
            : "none",
        sessions: daySessions.map((s) => ({
          id: s.id,
          type: s.type,
          targetKm: s.targetKm,
          status: sessionStatus(s, today, completed.has(s.id)),
          structure: s.structure,
        })),
        unlinkedRuns: (activitiesByDate.get(date) ?? [])
          .filter((act) => !act.plannedSessionId || !ids.has(act.plannedSessionId))
          .map((act) => ({ id: act.id, km: act.km })),
      });
    }
    const weekSessions = sessions.filter((s) => startOfWeek(s.date, weekStart) === start);
    const number = planWeeks.indexOf(start);
    weeks.push({
      start,
      days,
      plan:
        number < 0
          ? null
          : {
              number: number + 1,
              phase: weekSessions[0].phase,
              plannedKm: weekSessions.reduce((sum, s) => sum + (s.type === "rest" ? 0 : s.targetKm), 0),
              actualKm: volume.get(start)?.actualKm ?? 0,
              isCurrent: start === currentWeek,
            },
    });
  }

  const dates = sessions.map((s) => s.date).sort();
  const first = dates.length ? monthOf(dates[0]) : null;
  const last = dates.length ? monthOf(dates[dates.length - 1]) : null;
  const inPlan = (m: YearMonth) => first !== null && last !== null && m >= first && m <= last;
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  return { month, weeks, prev: inPlan(prev) ? prev : null, next: inPlan(next) ? next : null };
}
