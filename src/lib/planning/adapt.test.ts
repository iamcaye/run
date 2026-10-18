import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { MetricActivity } from "@/lib/metrics";
import { addDays, lastClosedWeekStart, startOfWeek } from "@/lib/time";
import { adaptPlan, expectedSessionPace, type AdaptContext, type AdaptSession } from "./adapt";
import { generatePlan } from "./generate";
import { paceTableFromRaceTime } from "./steps/paces";
import type { PlanGoal, PlanSettings } from "./types";

const PLAN_START = "2026-09-07"; // Monday
const settings: PlanSettings = { weekStart: 1, runDays: [2, 4, 6, 7], longRunDay: 7, maxRunsPerWeek: 4 };
const hr = { maxHr: 190, restHr: 50 };
const goal: PlanGoal = {
  raceDate: "2027-01-24",
  distanceKm: 21.0975,
  goalType: "target_time",
  targetTimeSeconds: 6300,
  startWeeklyKm: 30,
  level: "intermediate",
};

const plan = generatePlan({ goal, settings, startDate: PLAN_START });
const sessions: AdaptSession[] = plan.sessions.map((s, i) => ({
  id: `s${i}`,
  date: s.date,
  phase: s.phase,
  type: s.type,
  targetKm: s.targetKm,
  targetPaceSecPerKm: s.targetPaceSecPerKm,
  effortDescription: s.effortDescription,
  structure: s.structure,
  isUserEdited: false,
}));

/** "Closed" week under test: the 6th week of the plan. */
const CLOSED = addDays(PLAN_START, 5 * 7);
const NEXT = addDays(CLOSED, 7);

/** Six weeks of easy pre-plan running so ACWR has full history. */
const history: MetricActivity[] = Array.from({ length: 42 }, (_, i) => addDays(PLAN_START, -42 + i))
  .filter((_, i) => i % 2 === 0)
  .map((d) => run(d, 7, 360));

function run(date: string, km: number, pace: number, sessionId: string | null = null, extra: Partial<MetricActivity> = {}): MetricActivity {
  return { id: `a-${date}-${sessionId ?? "x"}`, localDate: date, km, seconds: Math.round(km * pace), rpe: null, avgHr: 145, hrSeries: null, plannedSessionId: sessionId, ...extra };
}

/** Runs every planned session up to `until` as prescribed, except those `skip` rejects. */
function asPlanned(until: string, skip: (s: AdaptSession) => boolean = () => false, kmFactor = 1): MetricActivity[] {
  return sessions
    .filter((s) => s.date <= until && s.type !== "rest" && !skip(s))
    .map((s) => run(s.date, s.targetKm * kmFactor, s.targetPaceSecPerKm ?? 360, s.id));
}

const ctx = (activities: MetricActivity[], over: Partial<AdaptContext> = {}): AdaptContext => ({
  goal,
  settings: { ...hr, weekStart: 1 },
  sessions,
  activities,
  weekStart: CLOSED,
  ...over,
});

const weekKm = (list: readonly { date: string; targetKm: number }[], week: string) =>
  list.filter((s) => startOfWeek(s.date, 1) === week).reduce((a, s) => a + s.targetKm, 0);

/** Sessions with an adjustment's `after` values applied. */
function apply(changes: ReturnType<typeof adaptPlan>[number]["changes"]) {
  const byId = new Map(changes.map((c) => [c.sessionId, c]));
  return sessions.map((s) => {
    const c = byId.get(s.id);
    return c?.op === "update" ? { ...s, ...c.after } : s;
  });
}

describe("adaptPlan", () => {
  it("on-plan training → no changes", () => {
    expect(adaptPlan(ctx([...history, ...asPlanned(addDays(CLOSED, 6))]))).toEqual([]);
  });

  it("missed long run: not made up, nothing stacked", () => {
    const acts = [...history, ...asPlanned(addDays(CLOSED, 6), (s) => s.type === "long" && s.date >= CLOSED)];
    expect(adaptPlan(ctx(acts))).toEqual([]);
  });

  it("> 7 days without runs → step back one week, then rebuild ≤ 10%/week", () => {
    const lastRun = addDays(NEXT, -11);
    const [adj, ...rest] = adaptPlan(ctx([...history, ...asPlanned(lastRun)]));
    expect(rest).toEqual([]); // only one volume rule, even though compliance is also low
    expect(adj?.rule).toBe("inactivity_gap");
    expect(adj?.reason).toMatch(/haven't run for 10 days.*1 week/);

    const after = apply(adj?.changes ?? []);
    const level = weekKm(sessions, addDays(NEXT, -7));
    expect(weekKm(after, NEXT)).toBeLessThanOrEqual(level + 0.5);
    for (let i = 1; i < 4; i++) {
      expect(weekKm(after, addDays(NEXT, 7 * i))).toBeLessThanOrEqual(level * 1.1 ** i + 0.5);
    }
    // Taper and race week are never touched.
    const touched = new Set(adj?.changes.map((c) => c.sessionId));
    expect(sessions.filter((s) => s.phase === "taper" || s.phase === "race").some((s) => touched.has(s.id))).toBe(false);
  });

  it("> 14 days without runs → step back two weeks", () => {
    const [adj] = adaptPlan(ctx([...history.filter((a) => a.localDate < addDays(NEXT, -20))]));
    expect(adj?.rule).toBe("inactivity_gap");
    expect(adj?.reason).toMatch(/2 weeks/);
    expect(weekKm(apply(adj?.changes ?? []), NEXT)).toBeLessThanOrEqual(weekKm(sessions, addDays(NEXT, -14)) + 0.5);
  });

  it("no runs ever → no inactivity rule (sync may not be set up)", () => {
    expect(adaptPlan(ctx([]))).toEqual([]);
  });

  it("ACWR > 1.5 → next week at 85% and one quality session becomes easy", () => {
    const spike = Array.from({ length: 7 }, (_, i) => run(addDays(CLOSED, i), 16, 330, null, { rpe: 7 }));
    const acts = [...history, ...asPlanned(addDays(CLOSED, -1)), ...spike];
    const [adj] = adaptPlan(ctx(acts));
    expect(adj?.rule).toBe("acwr_high");
    const after = apply(adj?.changes ?? []);
    expect(weekKm(after, NEXT)).toBeLessThanOrEqual(weekKm(sessions, NEXT) * 0.85 + 0.5);
    const qualityBefore = sessions.filter((s) => startOfWeek(s.date, 1) === NEXT && ["tempo", "intervals", "race_pace"].includes(s.type)).length;
    const qualityAfter = after.filter((s) => startOfWeek(s.date, 1) === NEXT && ["tempo", "intervals", "race_pace"].includes(s.type)).length;
    expect(qualityAfter).toBe(qualityBefore - 1);
    // Only next week changes.
    expect(adj?.changes.every((c) => startOfWeek(sessions.find((s) => s.id === c.sessionId)?.date ?? "", 1) === NEXT)).toBe(true);
  });

  it("ACWR is ignored without 28 days of history", () => {
    const spike = Array.from({ length: 7 }, (_, i) => run(addDays(CLOSED, i), 16, 330, null, { rpe: 8 }));
    expect(adaptPlan(ctx([...asPlanned(addDays(CLOSED, -1)).filter((a) => a.localDate >= addDays(CLOSED, -14)), ...spike]))).toEqual([]);
  });

  it("compliance < 70% two weeks in a row → repeat this week's load", () => {
    const acts = [...history, ...asPlanned(addDays(CLOSED, -8)), ...asPlanned(addDays(CLOSED, 6), () => false, 0.5).filter((a) => a.localDate >= addDays(CLOSED, -7))];
    const [adj] = adaptPlan(ctx(acts));
    expect(adj?.rule).toBe("low_compliance");
    expect(adj?.reason).toMatch(/50% and 50%/);
    expect(weekKm(apply(adj?.changes ?? []), NEXT)).toBeLessThanOrEqual(weekKm(sessions, CLOSED) + 0.5);
  });

  it("one low week is not enough", () => {
    const acts = [...history, ...asPlanned(addDays(CLOSED, -1)), ...asPlanned(addDays(CLOSED, 6), () => false, 0.5).filter((a) => a.localDate >= CLOSED)];
    expect(adaptPlan(ctx(acts))).toEqual([]);
  });

  it("never changes user-edited or completed sessions", () => {
    const edited = sessions.filter((s) => s.date >= NEXT).slice(0, 1).map((s) => s.id);
    const s2 = sessions.map((s) => (edited.includes(s.id) ? { ...s, isUserEdited: true } : s));
    const [adj] = adaptPlan(ctx([...history, ...asPlanned(addDays(NEXT, -11))], { sessions: s2 }));
    expect(adj?.changes.length).toBeGreaterThan(0);
    expect(adj?.changes.some((c) => edited.includes(c.sessionId))).toBe(false);
  });

  describe("goal review suggestion", () => {
    const paces = paceTableFromRaceTime(6300, 21.0975);
    const qualitySessions = sessions.filter((s) => ["tempo", "intervals", "race_pace"].includes(s.type));
    // A closed week by which at least 3 quality sessions have happened (build phase).
    const Q_CLOSED = startOfWeek(qualitySessions[3]?.date ?? "", 1);
    const qEnd = addDays(Q_CLOSED, 6);
    const onPlan = asPlanned(qEnd).filter((a) => !qualitySessions.some((q) => q.id === a.plannedSessionId));
    const fastQuality = qualitySessions
      .filter((s) => s.date <= qEnd)
      .map((s) => run(s.date, s.targetKm, (expectedSessionPace(s, paces) ?? 300) * 0.94, s.id));
    const reviews = (r: ReturnType<typeof adaptPlan>) => r.filter((a) => a.rule === "goal_review");

    it("suggests reviewing the goal after 3 fast quality sessions, changing nothing", () => {
      const result = adaptPlan(ctx([...history, ...onPlan, ...fastQuality], { weekStart: Q_CLOSED }));
      expect(reviews(result)).toEqual([{ rule: "goal_review", reason: expect.stringMatching(/6% faster.*1:45:00/), changes: [] }]);
    });

    it("not repeated within 4 weeks, and not for finish goals", () => {
      const acts = [...history, ...onPlan, ...fastQuality];
      const recent = { previousAdjustments: [{ rule: "goal_review" as const, runWeekStart: addDays(Q_CLOSED, -14) }] };
      expect(reviews(adaptPlan(ctx(acts, { weekStart: Q_CLOSED, ...recent })))).toEqual([]);
      expect(reviews(adaptPlan(ctx(acts, { weekStart: Q_CLOSED, goal: { ...goal, goalType: "finish", targetTimeSeconds: null } })))).toEqual([]);
      // Quality sessions run exactly as prescribed (warm-up/cool-down easy, main set on target): no suggestion.
      const onTarget = qualitySessions
        .filter((s) => s.date <= qEnd)
        .map((s) => run(s.date, s.targetKm, expectedSessionPace(s, paces) ?? 300, s.id));
      expect(reviews(adaptPlan(ctx([...history, ...onPlan, ...onTarget], { weekStart: Q_CLOSED })))).toEqual([]);
    });

    it("expected session pace mixes easy warm-up/cool-down with the main set", () => {
      const tempo = sessions.find((s) => s.type === "tempo");
      if (!tempo) throw new Error();
      const p = expectedSessionPace(tempo, paces) ?? 0;
      expect(p).toBeGreaterThan(paces.tempo ?? 0);
      expect(p).toBeLessThan(paces.easy ?? 0);
    });
  });

  it("properties: only reduces, only future & untouched sessions, at most one volume rule, deterministic", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }), // last run, days before next week
        fc.double({ min: 0.2, max: 1.3, noNaN: true }), // how much of the plan was run
        fc.integer({ min: 0, max: 3 }), // spike intensity
        (gap, factor, spike) => {
          const acts = [
            ...history,
            ...asPlanned(addDays(NEXT, -1 - gap), () => false, factor),
            ...Array.from({ length: spike * 2 }, (_, i) => run(addDays(NEXT, -1 - gap - i), 10 * spike, 320, null, { rpe: 8 })),
          ];
          const result = adaptPlan(ctx(acts));
          expect(result).toEqual(adaptPlan(ctx(acts)));
          expect(result.filter((a) => a.rule !== "goal_review").length).toBeLessThanOrEqual(1);
          const linked = new Set(acts.map((a) => a.plannedSessionId));
          for (const adj of result) {
            for (const c of adj.changes) {
              const s = sessions.find((x) => x.id === c.sessionId);
              expect(s && s.date >= NEXT && !s.isUserEdited && !linked.has(s.id)).toBe(true);
              if (c.op === "update") expect(c.after.targetKm).toBeLessThanOrEqual(c.before.targetKm);
            }
          }
        },
      ),
      { numRuns: Number(process.env.FC_RUNS ?? 200) },
    );
  });
});

describe("lastClosedWeekStart (user's time zone)", () => {
  it("previous week closes on the first day at 03:00 local", () => {
    // Monday 2026-10-19 02:30 Madrid (00:30Z) → still the week before last.
    expect(lastClosedWeekStart(new Date("2026-10-19T00:30:00Z"), "Europe/Madrid", 1, 3)).toBe("2026-10-05");
    // Monday 03:10 Madrid → last week (12th) is closed.
    expect(lastClosedWeekStart(new Date("2026-10-19T01:10:00Z"), "Europe/Madrid", 1, 3)).toBe("2026-10-12");
    // Same instant in New York is still Sunday evening.
    expect(lastClosedWeekStart(new Date("2026-10-19T01:10:00Z"), "America/New_York", 1, 3)).toBe("2026-10-05");
    // Sunday-start weeks.
    expect(lastClosedWeekStart(new Date("2026-10-21T12:00:00Z"), "UTC", 7, 3)).toBe("2026-10-11");
  });
});
