import { ADAPTATION, EFFORT_DESCRIPTIONS, PLANNING, type SessionType } from "@/config/training";
import {
  acwrOn,
  dailyLoads,
  effectiveRpe,
  srpeLoad,
  weeklyVolume,
  type HrSettings,
  type MetricActivity,
} from "@/lib/metrics";
import { addDays, daysBetween, startOfWeek, type IsoWeekday, type LocalDate } from "@/lib/time";
import { formatDuration } from "@/lib/units";
import { derivePaces, type PaceTable } from "./steps/paces";
import { roundTo } from "./steps/volume";
import type {
  AdjustableSessionFields,
  AdjustmentChange,
  Phase,
  PlanGoal,
  SessionStructure,
} from "./types";

export type AdaptSession = AdjustableSessionFields & {
  id: string;
  date: LocalDate;
  /** Null for custom-plan sessions (adaptation never runs on those, but the row type allows it). */
  phase: Phase | null;
  isUserEdited: boolean;
};

export type AdjustmentRule = "low_compliance" | "acwr_high" | "inactivity_gap" | "goal_review";

/** A proposal; the caller stores it as a `plan_adjustment` row with status `proposed`. */
export type PlanAdjustmentDraft = {
  rule: AdjustmentRule;
  reason: string;
  changes: AdjustmentChange[];
};

export type AdaptContext = {
  goal: PlanGoal;
  settings: HrSettings & { weekStart: IsoWeekday };
  sessions: readonly AdaptSession[];
  activities: readonly MetricActivity[];
  /** Start of the week that just closed. Only sessions from the following week on can change. */
  weekStart: LocalDate;
  /** Earlier adjustments for this goal (to avoid repeating the goal-review suggestion). */
  previousAdjustments?: readonly { rule: AdjustmentRule; runWeekStart: LocalDate }[];
};

const QUALITY: ReadonlySet<SessionType> = new Set(["tempo", "intervals", "race_pace"]);
const SCALABLE: ReadonlySet<SessionType> = new Set(["easy", "long", "strides"]);

const fields = (s: AdaptSession): AdjustableSessionFields => ({
  type: s.type,
  targetKm: s.targetKm,
  targetPaceSecPerKm: s.targetPaceSecPerKm,
  effortDescription: s.effortDescription,
  structure: s.structure,
});

/**
 * Weekly adaptation (pure). Volume rules are mutually exclusive, by precedence:
 * inactivity gap > ACWR spike > low compliance. A missed long run is deliberately never made up.
 * The goal-review suggestion is independent and changes nothing by itself.
 * Only future sessions change; user-edited and completed ones are never touched.
 */
export function adaptPlan(ctx: AdaptContext): PlanAdjustmentDraft[] {
  const nextWeek = addDays(ctx.weekStart, 7);
  const weekEnd = addDays(ctx.weekStart, 6);
  const linked = new Set(ctx.activities.map((a) => a.plannedSessionId).filter((id): id is string => id !== null));
  const changeable = ctx.sessions.filter((s) => s.date >= nextWeek && !s.isUserEdited && !linked.has(s.id));
  const weekOf = (d: LocalDate) => startOfWeek(d, ctx.settings.weekStart);

  const out: PlanAdjustmentDraft[] = [];
  // No runs at all: likely sync isn't set up yet, so volume rules would only punish that.
  const anyRuns = ctx.activities.some((a) => a.localDate <= weekEnd);
  const volume = anyRuns
    ? (inactivityRule(ctx, changeable, nextWeek, weekOf) ??
      acwrRule(ctx, changeable, nextWeek, weekEnd, weekOf) ??
      complianceRule(ctx, changeable, nextWeek, weekEnd, weekOf))
    : null;
  if (volume && volume.changes.length > 0) out.push(volume);
  const review = goalReviewRule(ctx, weekEnd);
  if (review) out.push(review);
  return out;
}

// ── Rules ────────────────────────────────────────────────────────────────────

function inactivityRule(
  ctx: AdaptContext,
  changeable: readonly AdaptSession[],
  nextWeek: LocalDate,
  weekOf: (d: LocalDate) => LocalDate,
): PlanAdjustmentDraft | null {
  const before = ctx.activities.filter((a) => a.localDate < nextWeek).map((a) => a.localDate).sort();
  const last = before.at(-1);
  // Without any runs at all we can't tell a break from "sync not set up yet".
  if (!last) return null;
  const gap = daysBetween(last, nextWeek) - 1;
  if (gap <= ADAPTATION.inactivity.gapDays) return null;

  const stepBack = gap > ADAPTATION.inactivity.twoWeeksAfterDays ? ADAPTATION.inactivity.stepBackWeeks[1] : ADAPTATION.inactivity.stepBackWeeks[0];
  const level = plannedWeekKm(ctx.sessions, addDays(nextWeek, -7 * stepBack), weekOf);
  if (level <= 0) return null;
  const { changes, firstWeek } = capFutureVolume(ctx.sessions, changeable, level, nextWeek, weekOf);
  return {
    rule: "inactivity_gap",
    reason:
      `You haven't run for ${gap} days, so I've stepped the plan back ${stepBack} week${stepBack === 1 ? "" : "s"}: ` +
      `this week is about ${km(firstWeek?.after)} instead of ${km(firstWeek?.before)}, building back up by at most 10% a week.`,
    changes,
  };
}

function acwrRule(
  ctx: AdaptContext,
  changeable: readonly AdaptSession[],
  nextWeek: LocalDate,
  weekEnd: LocalDate,
  weekOf: (d: LocalDate) => LocalDate,
): PlanAdjustmentDraft | null {
  const typeById = new Map(ctx.sessions.map((s) => [s.id, s.type]));
  const loads = dailyLoads(
    ctx.activities
      .filter((a) => a.localDate <= weekEnd)
      .map((a) => ({
        date: a.localDate,
        load: srpeLoad(a.seconds, effectiveRpe(a, ctx.settings, a.plannedSessionId ? (typeById.get(a.plannedSessionId) ?? null) : null).rpe),
      })),
  );
  const first = [...loads.keys()].sort()[0] ?? null;
  const point = acwrOn(weekEnd, loads, first);
  // Ratios on less than 28 days of history are artifacts (see metrics).
  if (point.insufficientHistory || point.ratio === null || point.ratio <= ADAPTATION.acwr.threshold) return null;

  const week = changeable.filter((s) => weekOf(s.date) === nextWeek && s.phase !== "race");
  if (week.length === 0) return null;
  const changes: AdjustmentChange[] = [];

  // Turn one quality session (the last of the week) into an easy run.
  const quality = week.filter((s) => QUALITY.has(s.type)).slice(-ADAPTATION.acwr.removeQualitySessions);
  const easyPace = ctx.sessions.find((s) => s.type === "easy" && s.targetPaceSecPerKm !== null)?.targetPaceSecPerKm ?? null;
  const converted = new Map<string, AdjustableSessionFields>();
  for (const q of quality) {
    converted.set(q.id, { type: "easy", targetKm: q.targetKm, targetPaceSecPerKm: easyPace, effortDescription: EFFORT_DESCRIPTIONS.easy, structure: null });
  }

  const total = week.reduce((a, s) => a + s.targetKm, 0);
  const target = total * ADAPTATION.acwr.nextWeekVolumeFraction;
  const scaled = scaleWeek(
    week.map((s) => ({ session: s, current: converted.get(s.id) ?? fields(s) })),
    target,
  );
  for (const { session, after } of scaled) {
    if (!sameFields(fields(session), after)) changes.push({ op: "update", sessionId: session.id, before: fields(session), after });
  }
  return {
    rule: "acwr_high",
    reason:
      `Your training load jumped (last 7 days are ${point.ratio.toFixed(1)}× your 4-week average; above 1.5 raises injury risk). ` +
      `I lowered this week to about ${km(target)} and swapped ${quality.length === 1 ? "one quality session" : "a quality session"} for an easy run.`,
    changes,
  };
}

function complianceRule(
  ctx: AdaptContext,
  changeable: readonly AdaptSession[],
  nextWeek: LocalDate,
  weekEnd: LocalDate,
  weekOf: (d: LocalDate) => LocalDate,
): PlanAdjustmentDraft | null {
  const weeks = weeklyVolume({
    sessions: ctx.sessions.map((s) => ({ id: s.id, date: s.date, type: s.type, targetKm: s.targetKm })),
    activities: ctx.activities,
    weekStart: ctx.settings.weekStart,
    asOf: weekEnd,
  });
  const n = ADAPTATION.compliance.consecutiveWeeks;
  const recent = Array.from({ length: n }, (_, i) => weeks.find((w) => w.weekStart === addDays(ctx.weekStart, -7 * i)));
  if (!recent.every((w) => w && w.compliance !== null && w.compliance < ADAPTATION.compliance.threshold)) return null;

  const level = plannedWeekKm(ctx.sessions, ctx.weekStart, weekOf);
  if (level <= 0) return null;
  const { changes, firstWeek } = capFutureVolume(ctx.sessions, changeable, level, nextWeek, weekOf);
  const pct = recent.map((w) => `${Math.round((w?.compliance ?? 0) * 100)}%`).reverse().join(" and ");
  return {
    rule: "low_compliance",
    reason:
      `You completed ${pct} of the planned distance in the last ${n} weeks, so instead of progressing I've repeated this week's load: ` +
      `this week is about ${km(firstWeek?.after)} instead of ${km(firstWeek?.before)}.`,
    changes,
  };
}

function goalReviewRule(ctx: AdaptContext, weekEnd: LocalDate): PlanAdjustmentDraft | null {
  const { goal } = ctx;
  if (goal.goalType !== "target_time" || !goal.targetTimeSeconds) return null;
  const { consecutiveSessions, minFasterFraction, quietWeeks } = ADAPTATION.fasterThanTarget;
  const recentlySuggested = (ctx.previousAdjustments ?? []).some(
    (a) => a.rule === "goal_review" && daysBetween(a.runWeekStart, ctx.weekStart) < quietWeeks * 7,
  );
  if (recentlySuggested) return null;

  const { paces } = derivePaces({ goal, recentActivities: [], today: weekEnd });
  if (!paces) return null;
  const runBySession = new Map(ctx.activities.filter((a) => a.plannedSessionId).map((a) => [a.plannedSessionId as string, a]));
  const done = ctx.sessions
    .filter((s) => QUALITY.has(s.type) && s.date <= weekEnd && runBySession.has(s.id))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-consecutiveSessions);
  if (done.length < consecutiveSessions) return null;

  const margins = done.map((s) => {
    const run = runBySession.get(s.id);
    const expected = expectedSessionPace(s, paces);
    return run && expected ? 1 - run.seconds / run.km / expected : -1;
  });
  if (!margins.every((m) => m >= minFasterFraction)) return null;

  const avg = margins.reduce((a, m) => a + m, 0) / margins.length;
  return {
    rule: "goal_review",
    reason:
      `Your last ${consecutiveSessions} quality sessions were about ${Math.round(avg * 100)}% faster than planned. ` +
      `Your ${formatDuration(goal.targetTimeSeconds)} target may be too easy — consider reviewing it. Nothing changes unless you edit the goal.`,
    changes: [],
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Average pace a structured session should come out at: warm-up/cool-down easy, main set at target. */
export function expectedSessionPace(s: Pick<AdaptSession, "structure" | "targetKm" | "targetPaceSecPerKm" | "type">, paces: PaceTable): number | null {
  const easy = paces.easy ?? null;
  if (!s.structure) return s.targetPaceSecPerKm;
  let km = 0;
  let secs = 0;
  for (const step of s.structure.steps) {
    // Time-based blocks only occur in custom plans, which adaptation never sees.
    const stepKm = step.kind === "reps" ? step.reps * (step.repKm ?? 0) : (step.km ?? 0);
    const pace = step.kind === "warmup" || step.kind === "cooldown" ? easy : (step.paceSecPerKm ?? s.targetPaceSecPerKm);
    if (!pace || stepKm <= 0) continue;
    km += stepKm;
    secs += stepKm * pace;
  }
  return km > 0 ? secs / km : s.targetPaceSecPerKm;
}

function plannedWeekKm(sessions: readonly AdaptSession[], weekStart: LocalDate, weekOf: (d: LocalDate) => LocalDate): number {
  return sessions.filter((s) => weekOf(s.date) === weekStart && s.type !== "rest").reduce((a, s) => a + s.targetKm, 0);
}

/**
 * Caps each future training week at `level × 1.1^i` (i = calendar weeks after `nextWeek`), so
 * volume restarts from `level` and progresses ≤10% a week until it rejoins the original plan.
 * Kept sessions count toward a week's total but only changeable ones are rescaled. Taper/race untouched.
 */
function capFutureVolume(
  all: readonly AdaptSession[],
  changeable: readonly AdaptSession[],
  level: number,
  nextWeek: LocalDate,
  weekOf: (d: LocalDate) => LocalDate,
): { changes: AdjustmentChange[]; firstWeek: { before: number; after: number } | null } {
  const canChange = new Set(changeable.map((s) => s.id));
  const byWeek = new Map<LocalDate, AdaptSession[]>();
  for (const s of all) {
    if (s.date < nextWeek || s.type === "rest") continue;
    const k = weekOf(s.date);
    byWeek.set(k, [...(byWeek.get(k) ?? []), s]);
  }
  const changes: AdjustmentChange[] = [];
  let firstWeek: { before: number; after: number } | null = null;
  for (const week of [...byWeek.keys()].sort()) {
    const sessions = byWeek.get(week) ?? [];
    if (sessions.some((s) => s.phase === "taper" || s.phase === "race")) break;
    const total = sessions.reduce((a, s) => a + s.targetKm, 0);
    const cap = level * (1 + PLANNING.maxWeeklyIncrease) ** (daysBetween(nextWeek, week) / 7);
    if (total <= cap) {
      firstWeek ??= { before: total, after: total };
      continue;
    }
    const keptKm = sessions.filter((s) => !canChange.has(s.id)).reduce((a, s) => a + s.targetKm, 0);
    const scaled = scaleWeek(
      sessions.filter((s) => canChange.has(s.id)).map((s) => ({ session: s, current: fields(s) })),
      cap - keptKm,
    );
    const after = keptKm + scaled.reduce((a, x) => a + x.after.targetKm, 0);
    firstWeek ??= { before: total, after };
    for (const { session, after: f } of scaled) {
      if (!sameFields(fields(session), f)) changes.push({ op: "update", sessionId: session.id, before: fields(session), after: f });
    }
  }
  return { changes, firstWeek };
}

/**
 * Brings a week's total to (at most) `target` km by scaling easy, long and strides runs; quality
 * sessions keep their structure. Runs never drop below `minScaledRunKm`.
 */
function scaleWeek(
  items: readonly { session: AdaptSession; current: AdjustableSessionFields }[],
  target: number,
): { session: AdaptSession; after: AdjustableSessionFields }[] {
  const fixedKm = items.filter((x) => !SCALABLE.has(x.current.type)).reduce((a, x) => a + x.current.targetKm, 0);
  const scalableKm = items.filter((x) => SCALABLE.has(x.current.type)).reduce((a, x) => a + x.current.targetKm, 0);
  const factor = scalableKm > 0 ? Math.max(0, Math.min(1, (target - fixedKm) / scalableKm)) : 1;
  return items.map(({ session, current }) => {
    if (!SCALABLE.has(current.type) || factor >= 1) return { session, after: current };
    const targetKm = Math.max(ADAPTATION.minScaledRunKm, roundTo(current.targetKm * factor));
    return { session, after: { ...current, targetKm, structure: scaleStructure(current.structure, targetKm / current.targetKm) } };
  });
}

function scaleStructure(structure: SessionStructure | null, factor: number): SessionStructure | null {
  if (!structure) return null;
  return {
    steps: structure.steps.map((step) => (step.kind === "steady" && step.km !== undefined ? { ...step, km: roundTo(step.km * factor) } : step)),
  };
}

function sameFields(a: AdjustableSessionFields, b: AdjustableSessionFields): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const km = (v: number | undefined) => `${Math.round(v ?? 0)} km`;
