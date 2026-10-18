import "server-only";
import { METRICS } from "@/config/training";
import { needsResultPrompt } from "@/lib/goals/rules";
import {
  acwrSeries,
  dailyLoads,
  effectiveRpe,
  longRunProgression,
  predictRace,
  sessionStatus,
  srpeLoad,
  weeklyVolume,
  type AcwrPoint,
  type LongRunPoint,
  type MetricActivity,
  type RacePrediction,
  type SessionStatus,
  type WeekVolume,
} from "@/lib/metrics";
import type { Phase } from "@/lib/planning/types";
import { addDays, daysBetween, localDateOf, startOfWeek, type IsoWeekday, type LocalDate } from "@/lib/time";
import type { Goal, PlannedSession, Settings, UserScope } from "@/server/dal";
import { toAdjustmentView, type AdjustmentView } from "./adjustment-view";

export type DashboardSession = PlannedSession & { status: SessionStatus; actualKm: number | null };

export type Dashboard = {
  goal: Goal | null;
  awaitingResult: Goal[];
  daysToRace: number | null;
  phase: Phase | null;
  weekNumber: number | null;
  totalWeeks: number | null;
  thisWeek: DashboardSession[];
  thisWeekVolume: WeekVolume | null;
  pendingAdjustments: AdjustmentView[];
  volume: (WeekVolume & { isCurrent: boolean })[];
  acwr: AcwrPoint[];
  acwrToday: AcwrPoint | null;
  /** Share of last 28 days' load whose RPE was estimated rather than logged. */
  estimatedLoadShare: number;
  prediction: RacePrediction | null;
  longRuns: LongRunPoint[];
};

const ACWR_CHART_DAYS = 8 * 7;

export async function getDashboard(scope: UserScope, settings: Settings, today: LocalDate): Promise<Dashboard> {
  const weekStart = settings.weekStart as IsoWeekday;
  const goals = await scope.goals.list();
  const goal = goals.find((g) => g.status === "active") ?? null;
  const awaitingResult = goals.filter((g) => needsResultPrompt(g, today));

  const sessions = goal ? await scope.sessions.listForGoal(goal.id) : [];
  const planStart = sessions[0]?.date ?? today;
  const acwrFrom = addDays(today, -(ACWR_CHART_DAYS - 1));
  const since = [planStart, addDays(acwrFrom, -METRICS.chronicDays)].sort()[0] ?? today;
  const rows = await scope.activities.since(new Date(`${addDays(since, -1)}T00:00:00Z`));

  const activities: MetricActivity[] = rows
    .map((a) => ({
      id: a.id,
      localDate: localDateOf(a.startAt, settings.timezone),
      km: a.km,
      seconds: a.seconds,
      rpe: a.rpe,
      avgHr: a.avgHr,
      hrSeries: a.hrSeries,
      plannedSessionId: a.plannedSessionId,
    }))
    .filter((a) => a.localDate >= since);

  // Load per day (sRPE), RPE estimated when not logged.
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  let estimated = 0;
  let recentTotal = 0;
  const loads = activities.map((a) => {
    const { rpe, source } = effectiveRpe(a, settings, a.plannedSessionId ? (sessionById.get(a.plannedSessionId)?.type ?? null) : null);
    const load = srpeLoad(a.seconds, rpe);
    if (a.localDate > addDays(today, -METRICS.chronicDays)) {
      recentTotal += load;
      if (source !== "logged") estimated += load;
    }
    return { date: a.localDate, load };
  });
  const acwr = acwrSeries(acwrFrom, today, dailyLoads(loads));

  const metricSessions = sessions.map((s) => ({ id: s.id, date: s.date, type: s.type, targetKm: s.targetKm }));
  const currentWeek = startOfWeek(today, weekStart);
  const volume = weeklyVolume({ sessions: metricSessions, activities: activities.filter((a) => a.localDate >= planStart), weekStart, asOf: today }).map(
    (w) => ({ ...w, isCurrent: w.weekStart === currentWeek }),
  );

  const actualBySession = new Map<string, number>();
  for (const a of activities) if (a.plannedSessionId) actualBySession.set(a.plannedSessionId, (actualBySession.get(a.plannedSessionId) ?? 0) + a.km);
  const thisWeek = sessions
    .filter((s) => startOfWeek(s.date, weekStart) === currentWeek)
    .map((s) => {
      const actualKm = actualBySession.get(s.id) ?? null;
      return { ...s, actualKm, status: sessionStatus(s, today, actualKm !== null) };
    });

  const weekStarts = [...new Set(sessions.map((s) => startOfWeek(s.date, weekStart)))];
  const weekIdx = weekStarts.indexOf(currentWeek);

  return {
    goal,
    awaitingResult,
    daysToRace: goal ? daysBetween(today, goal.raceDate) : null,
    phase: thisWeek[0]?.phase ?? sessions.find((s) => s.date >= today)?.phase ?? null,
    weekNumber: weekIdx === -1 ? null : weekIdx + 1,
    totalWeeks: weekStarts.length || null,
    thisWeek,
    thisWeekVolume: volume.find((w) => w.isCurrent) ?? null,
    // Pending proposals, plus ones decided in the last day so the outcome stays visible.
    pendingAdjustments: goal
      ? (await scope.adjustments.listForGoal(goal.id))
          .filter((a) => a.status === "proposed" || (a.status !== "superseded" && a.decidedAt && Date.now() - a.decidedAt.getTime() < 86_400_000))
          .map((a) => toAdjustmentView(a, sessions))
      : [],
    volume,
    acwr,
    acwrToday: acwr.at(-1) ?? null,
    estimatedLoadShare: recentTotal > 0 ? estimated / recentTotal : 0,
    prediction: goal
      ? predictRace({
          activities,
          goalKm: goal.distanceKm,
          asOf: today,
          sessionTypeOf: (a) => (a.plannedSessionId ? (sessionById.get(a.plannedSessionId)?.type ?? null) : null),
          hr: settings,
        })
      : null,
    longRuns: longRunProgression(metricSessions, activities),
  };
}
