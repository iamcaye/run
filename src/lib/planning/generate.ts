import { distanceKeyFor, PLANNING } from "@/config/training";
import { addDays, type LocalDate } from "@/lib/time";
import { assignDays, pickLongRunDate, runDaysOf } from "./steps/assign-days";
import { derivePaces, type PaceTable } from "./steps/paces";
import { allocatePhases } from "./steps/phases";
import { sizeSessions, type SizedSession } from "./steps/size-sessions";
import { sessionTemplate, type WeekTemplate } from "./steps/template";
import { buildVolumeCurve, floorTo } from "./steps/volume";
import { buildWeekGrid } from "./steps/week-grid";
import {
  HARD_TYPES,
  isFrozen,
  type ExistingSession,
  type PlanGoal,
  type PlannedSessionDraft,
  type PlanResult,
  type PlanSettings,
  type PlanWarning,
  type PlanWeek,
  type RecentActivity,
  type SessionStructure,
} from "./types";

export type GeneratePlanInput = {
  goal: PlanGoal;
  settings: PlanSettings;
  /** First day the plan may schedule sessions (usually today, in the user's timezone). */
  startDate: LocalDate;
  /**
   * When regenerating: the goal's stored sessions. Past, user-edited and completed sessions are
   * frozen; new drafts are only produced for future dates not occupied by a frozen session.
   */
  existingSessions?: readonly ExistingSession[];
  /** Today in the user's timezone (defaults to startDate). Used for regeneration and pace estimates. */
  today?: LocalDate;
  recentActivities?: readonly RecentActivity[];
};

export type GeneratePlanResult = PlanResult & {
  /** Stored sessions to replace (only when `existingSessions` was given). */
  deleteIds: string[];
};

/**
 * Pure, deterministic plan generator:
 * week grid → phases → volume curve → templates → days → sizes → paces (→ regeneration filter).
 */
export function generatePlan(input: GeneratePlanInput): GeneratePlanResult {
  const { goal, settings, startDate, existingSessions, recentActivities = [] } = input;
  const today = input.today ?? startDate;
  const distanceKey = distanceKeyFor(goal.distanceKm);
  const tablePeakKm = PLANNING.peakWeeklyKm[distanceKey][goal.level];

  const grid = buildWeekGrid({ startDate, raceDate: goal.raceDate, weekStart: settings.weekStart, distanceKey });
  const warnings: PlanWarning[] = [...grid.warnings];
  if (grid.weeks.length === 0) {
    return { sessions: [], weeks: [], warnings, distanceKey, peakKm: 0, deleteIds: [] };
  }

  const phases = allocatePhases({
    weekCount: grid.weeks.length,
    maintenanceWeeks: grid.maintenanceWeeks,
    distanceKey,
    startWeeklyKm: goal.startWeeklyKm,
    tablePeakKm,
  });
  const curve = buildVolumeCurve({
    phases,
    maintenanceWeeks: grid.maintenanceWeeks,
    startWeeklyKm: goal.startWeeklyKm,
    tablePeakKm,
    distanceKey,
  });
  if (curve.peakKm < tablePeakKm - PLANNING.roundingKm) {
    warnings.push({ code: "peak_clamped", peakKm: curve.peakKm, tablePeakKm });
  }

  const weeks: PlanWeek[] = grid.weeks.map((w, i) => ({
    ...w,
    phase: phases[i] ?? "base",
    isMaintenance: i < grid.maintenanceWeeks,
    isDeload: curve.isDeload[i] ?? false,
    targetKm: curve.targets[i] ?? 0,
  }));

  const phaseCounters = new Map<string, number>();
  const templates = weeks.map((w) => {
    const n = phaseCounters.get(w.phase) ?? 0;
    phaseCounters.set(w.phase, n + 1);
    const template = sessionTemplate({ phase: w.phase, level: goal.level, distanceKey, weekInPhase: n });
    // A first week with only a day or two left is just easy running.
    const fewDays = runDaysOf(w.days, settings.runDays).length <= PLANNING.longRun.skipInPartialWeekWithDays;
    return w.isPartial && fewDays ? { ...template, long: false, quality: [], longRacePaceFinish: false } : template;
  });

  // Regeneration: frozen sessions stay as they are and the new plan is built around them —
  // they occupy their day, use up run slots and km, and count as hard/long days for spacing.
  const frozen = (existingSessions ?? []).filter((s) => isFrozen(s, today));
  const frozenByDate = new Map(frozen.map((s) => [s.date, s]));
  const frozenIn = (days: readonly LocalDate[]) =>
    days.map((d) => frozenByDate.get(d)).filter((s): s is ExistingSession => s !== undefined);
  const weekViews = weeks.map((w, i) => {
    // The whole calendar week: a kept session may sit outside the plan's usable days.
    const inWeek = frozenIn(Array.from({ length: 7 }, (_, d) => addDays(w.start, d)));
    const template = templates[i];
    return {
      frozen: inWeek,
      freeDays: w.days.filter((d) => !frozenByDate.has(d)),
      settings: { ...settings, maxRunsPerWeek: Math.max(0, settings.maxRunsPerWeek - inWeek.length) },
      template: template ? withoutFrozenSlots(template, inWeek) : undefined,
    };
  });

  // Pass 1: long-run dates for every week, so spacing rules can look across week boundaries.
  const raceDate = goal.raceDate;
  const longDates = weeks.map((w, i) => {
    const view = weekViews[i];
    const template = view?.template;
    if (!view || !template) return null;
    const picked = pickLongRunDate({ days: view.freeDays, settings: view.settings, template });
    if (picked.moved && !w.isPartial) warnings.push({ code: "long_run_moved", weekIndex: w.index });
    let date = picked.date;
    // Never put the long run next to race day.
    if (date && (date === addDays(raceDate, -1) || date === addDays(raceDate, 1))) {
      date =
        runDaysOf(view.freeDays, settings.runDays)
          .filter((d) => d !== raceDate && d !== addDays(raceDate, -1) && d !== addDays(raceDate, 1))
          .at(-1) ?? null;
    }
    return date;
  });
  const allLongDates = new Set([
    ...longDates.filter((d): d is LocalDate => d !== null),
    ...frozen.filter((s) => s.type === "long").map((s) => s.date),
  ]);

  // Pass 2: assign and size each week in order.
  const { paces, warnings: paceWarnings } = derivePaces({ goal, recentActivities, today });
  warnings.push(...paceWarnings);

  // The race is known up front, so earlier weeks keep their quality away from it too.
  const hardDates = new Set<LocalDate>([raceDate, ...frozen.filter((s) => HARD_TYPES.has(s.type)).map((s) => s.date)]);
  const sessions: PlannedSessionDraft[] = [];
  let longRef: number | null = null;

  weeks.forEach((week, i) => {
    const view = weekViews[i];
    const template = view?.template;
    if (!view || !template) return;
    const raceFrozen = frozenByDate.get(raceDate)?.type === "race";
    const isRaceWeek = week.phase === "race" && !raceFrozen;
    const fullWeekKm = week.isPartial
      ? floorTo(week.targetKm * Math.min(1, runDaysOf(week.days, settings.runDays).length / settings.runDays.length))
      : week.targetKm;
    const weekKm = Math.max(0, fullWeekKm - view.frozen.reduce((a, s) => a + s.targetKm, 0));

    const { roles, droppedQuality: notPlaced } = assignDays({
      days: view.freeDays,
      settings: view.settings,
      template: raceFrozen ? { ...template, race: false } : template,
      longDate: longDates[i] ?? null,
      raceDate: isRaceWeek ? raceDate : null,
      allLongDates,
      hardDates,
    });
    const sized = sizeSessions({
      roles,
      weekKm,
      referenceWeekKm: fullWeekKm,
      phase: week.phase,
      distanceKey,
      raceKm: goal.distanceKm,
      longRef,
      longRacePaceFinish: template.longRacePaceFinish,
    });
    if (notPlaced + sized.droppedQuality > 0 && !week.isPartial) {
      warnings.push({ code: "quality_dropped", weekIndex: week.index });
    }
    // Longest long run so far (including kept ones): next week may add at most +2 km to it.
    for (const km of [sized.longKm, ...view.frozen.filter((s) => s.type === "long").map((s) => s.targetKm)]) {
      if (km !== null) longRef = Math.max(longRef ?? 0, km);
    }

    for (const s of sized.sessions) {
      if (HARD_TYPES.has(s.type)) hardDates.add(s.date);
      sessions.push(toDraft(s, week, paces));
    }
  });

  if (!existingSessions) {
    return { sessions, weeks, warnings, distanceKey, peakKm: curve.peakKm, deleteIds: [] };
  }
  const { keep, deleteIds } = regenerationFilter(sessions, existingSessions, today);
  return { sessions: keep, weeks, warnings, distanceKey, peakKm: curve.peakKm, deleteIds };
}

/**
 * Regeneration never modifies past, user-edited or completed sessions. Every other stored
 * session from today on is replaced by the new drafts, except on dates a frozen session occupies.
 */
export function regenerationFilter(
  drafts: readonly PlannedSessionDraft[],
  existing: readonly ExistingSession[],
  today: LocalDate,
): { keep: PlannedSessionDraft[]; deleteIds: string[] } {
  const frozenDates = new Set(existing.filter((s) => isFrozen(s, today)).map((s) => s.date));
  return {
    keep: drafts.filter((d) => d.date >= today && !frozenDates.has(d.date)),
    deleteIds: existing.filter((s) => !isFrozen(s, today)).map((s) => s.id),
  };
}

/** A kept long run / quality session satisfies the matching slot in its week's template. */
function withoutFrozenSlots(template: WeekTemplate, frozen: readonly ExistingSession[]): WeekTemplate {
  const quality = [...template.quality];
  for (const s of frozen) {
    if (s.type !== "tempo" && s.type !== "intervals" && s.type !== "race_pace") continue;
    const same = quality.indexOf(s.type);
    quality.splice(same === -1 ? quality.length - 1 : same, 1);
  }
  const hasLong = frozen.some((s) => s.type === "long");
  return {
    ...template,
    quality,
    long: template.long && !hasLong,
    longRacePaceFinish: template.longRacePaceFinish && !hasLong,
  };
}

function toDraft(s: SizedSession, week: PlanWeek, paces: PaceTable | null): PlannedSessionDraft {
  const pace = paces?.[s.paceKind] ?? null;
  return {
    date: s.date,
    weekIndex: week.index,
    phase: week.phase,
    type: s.type,
    targetKm: s.km,
    targetPaceSecPerKm: pace === null ? null : Math.round(pace),
    effortDescription: s.effortDescription,
    structure: s.structure && paces ? withPaces(s.structure, paces) : s.structure,
  };
}

function withPaces(structure: SessionStructure, paces: PaceTable): SessionStructure {
  return {
    steps: structure.steps.map((step) => {
      if ((step.kind === "reps" || step.kind === "steady") && step.zone) {
        const p = paces[step.zone];
        return p === null ? step : { ...step, paceSecPerKm: Math.round(p) };
      }
      return step;
    }),
  };
}
