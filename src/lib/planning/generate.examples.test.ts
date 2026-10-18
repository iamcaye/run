import { describe, expect, it } from "vitest";
import { DISTANCE_PRESETS_KM, LEVELS, PLANNING, type DistanceKey, type Level } from "@/config/training";
import { addDays } from "@/lib/time";
import { generatePlan, regenerationFilter } from "./generate";
import type { PlanGoal, PlanSettings, PlannedSessionDraft } from "./types";

const START = "2026-10-19"; // Monday
const settings: PlanSettings = { weekStart: 1, runDays: [2, 4, 6, 7], longRunDay: 7, maxRunsPerWeek: 4 };
const QUALITY = new Set(["tempo", "intervals", "race_pace"]);

function goal(distance: DistanceKey, level: Level, overrides: Partial<PlanGoal> = {}): PlanGoal {
  return {
    raceDate: addDays(START, 18 * 7 - 1), // Sunday of week 18
    distanceKm: DISTANCE_PRESETS_KM[distance],
    goalType: "finish",
    targetTimeSeconds: null,
    startWeeklyKm: Math.round(PLANNING.peakWeeklyKm[distance][level] * 0.6),
    level,
    ...overrides,
  };
}

const byWeek = (sessions: PlannedSessionDraft[], index: number) => sessions.filter((s) => s.weekIndex === index);

describe("every distance × level (18 weeks)", () => {
  for (const distance of ["5k", "10k", "half", "marathon"] as const) {
    for (const level of LEVELS) {
      it(`${distance} ${level}`, () => {
        const g = goal(distance, level);
        const plan = generatePlan({ goal: g, settings, startDate: START });
        const tablePeak = PLANNING.peakWeeklyKm[distance][level];
        const phases = plan.weeks.map((w) => w.phase);

        // Phases are contiguous and in order, taper count includes race week.
        const order = ["base", "build", "specific", "taper", "race"];
        expect(phases.map((p) => order.indexOf(p))).toEqual([...phases.map((p) => order.indexOf(p))].sort((a, b) => a - b));
        for (const p of ["base", "build", "specific"]) expect(phases).toContain(p);
        const taperLen = PLANNING.taperFractions[distance].length;
        expect(phases.slice(-taperLen)).toEqual([...Array(taperLen - 1).fill("taper"), "race"]);

        // Peak is reached from 60% of it, and the taper follows the configured fractions.
        expect(plan.peakKm).toBe(tablePeak);
        const taperTargets = plan.weeks.slice(-taperLen).map((w) => w.targetKm);
        expect(taperTargets).toEqual(PLANNING.taperFractions[distance].map((f) => Math.round((tablePeak * f) / 0.5) * 0.5));

        // Deloads exist, but not in the last cycle before the taper.
        const deloads = plan.weeks.filter((w) => w.isDeload).map((w) => w.index);
        expect(deloads.length).toBeGreaterThan(0);
        const taperStart = plan.weeks.length - taperLen;
        expect(deloads.every((i) => i < taperStart - PLANNING.deload.cycleLength + 1)).toBe(true);

        // Quality per week by level.
        const maxQ = PLANNING.maxQualityPerWeek[level];
        for (const w of plan.weeks) {
          const q = byWeek(plan.sessions, w.index).filter((s) => QUALITY.has(s.type));
          expect(q.length).toBeLessThanOrEqual(maxQ);
          if (w.phase === "base") expect(q).toHaveLength(0);
          if (w.phase === "build" && !w.isDeload) expect(q.length).toBe(maxQ);
        }

        // Long run grows, stays under its cap, and is on Sunday.
        const longs = plan.sessions.filter((s) => s.type === "long");
        expect(longs.every((s) => new Date(`${s.date}T00:00:00Z`).getUTCDay() === 0)).toBe(true);
        expect(Math.max(...longs.map((s) => s.targetKm))).toBeLessThanOrEqual(PLANNING.longRun.capKm[distance]);
        // Half/marathon tapers include a pre-race week, so the last long run is shorter than the peak one.
        if (taperLen > 1) expect(longs.at(-1)?.targetKm).toBeLessThan(Math.max(...longs.map((s) => s.targetKm)));

        // Finish goal without activities → effort only.
        expect(plan.warnings).toContainEqual({ code: "no_paces" });
        expect(plan.sessions.every((s) => s.targetPaceSecPerKm === null && s.effortDescription.length > 0)).toBe(true);
      });
    }
  }
});

describe("paces", () => {
  it("target-time half marathon (1:45:00)", () => {
    const plan = generatePlan({
      goal: goal("half", "intermediate", { goalType: "target_time", targetTimeSeconds: 6300 }),
      settings,
      startDate: START,
    });
    const paceOf = (type: string) => plan.sessions.find((s) => s.type === type)?.targetPaceSecPerKm;
    expect(paceOf("race")).toBe(299); // 4:59 /km
    expect(paceOf("easy")).toBe(299 + 75);
    expect(paceOf("long")).toBe(299 + 60);
    // Riegel: 10K/15K-equivalent for tempo, 5K-equivalent for intervals — all faster than RP.
    const tempo = paceOf("tempo") ?? 0;
    const intervals = paceOf("intervals") ?? 0;
    expect(tempo).toBeLessThan(299);
    expect(intervals).toBeLessThan(tempo);
    // Rep paces are written into the structure.
    const reps = plan.sessions.find((s) => s.type === "intervals")?.structure?.steps.find((s) => s.kind === "reps");
    expect(reps && "paceSecPerKm" in reps ? reps.paceSecPerKm : null).toBe(intervals);
  });

  it("finish goal with a recent run estimates paces", () => {
    const plan = generatePlan({
      goal: goal("10k", "beginner"),
      settings,
      startDate: START,
      recentActivities: [
        { date: addDays(START, -3), km: 5, seconds: 30 * 60 },
        { date: addDays(START, -100), km: 5, seconds: 20 * 60 }, // too old
      ],
    });
    expect(plan.warnings).toContainEqual({ code: "paces_estimated", fromKm: 5 });
    const rp = plan.sessions.find((s) => s.type === "race")?.targetPaceSecPerKm ?? 0;
    // 5K in 30:00 → 10K ≈ 62:33 → ~375 s/km.
    expect(rp).toBeGreaterThan(370);
    expect(rp).toBeLessThan(380);
  });
});

describe("short and long lead times", () => {
  it("compresses a half marathon with 4 weeks, cutting base first", () => {
    const g = goal("half", "intermediate", { raceDate: addDays(START, 4 * 7 - 1) });
    const plan = generatePlan({ goal: g, settings, startDate: START });
    expect(plan.warnings).toContainEqual({ code: "compressed", weeks: 4, recommendedWeeks: 10 });
    // 10-week template squeezed into 4: base goes first, then build; taper + race are kept.
    expect(plan.weeks.map((w) => w.phase)).toEqual(["specific", "specific", "taper", "race"]);
  });

  it("race in 6 days: race week only", () => {
    const plan = generatePlan({ goal: goal("5k", "beginner", { raceDate: addDays(START, 6) }), settings, startDate: START });
    expect(plan.weeks.map((w) => w.phase)).toEqual(["race"]);
    expect(plan.sessions.find((s) => s.type === "race")?.date).toBe(addDays(START, 6));
  });

  it("race tomorrow (mid-week start)", () => {
    const start = "2026-10-22"; // Thursday
    const plan = generatePlan({ goal: goal("10k", "advanced", { raceDate: "2026-10-23" }), settings, startDate: start });
    expect(plan.sessions).toHaveLength(1);
    expect(plan.sessions[0]?.type).toBe("race");
  });

  it("race not in the future → no plan", () => {
    const plan = generatePlan({ goal: goal("10k", "advanced", { raceDate: START }), settings, startDate: START });
    expect(plan.sessions).toEqual([]);
    expect(plan.warnings).toEqual([{ code: "race_not_in_future" }]);
  });

  it("30 weeks out: extra weeks become a leading maintenance base block", () => {
    const plan = generatePlan({
      goal: goal("marathon", "intermediate", { raceDate: addDays(START, 30 * 7 - 1) }),
      settings,
      startDate: START,
    });
    const maintenance = plan.weeks.filter((w) => w.isMaintenance);
    expect(maintenance).toHaveLength(30 - PLANNING.maxCoreWeeks);
    expect(maintenance.every((w) => w.phase === "base" && w.targetKm === maintenance[0]?.targetKm)).toBe(true);
  });

  it("low starting volume clamps the peak and warns", () => {
    const plan = generatePlan({ goal: goal("marathon", "advanced", { startWeeklyKm: 15 }), settings, startDate: START });
    expect(plan.peakKm).toBeLessThan(PLANNING.peakWeeklyKm.marathon.advanced);
    expect(plan.warnings).toContainEqual({ code: "peak_clamped", peakKm: plan.peakKm, tablePeakKm: 90 });
  });
});

describe("days are short", () => {
  it("2 runs a week in build: long + one quality, easy runs dropped first", () => {
    const plan = generatePlan({
      goal: goal("10k", "advanced"),
      settings: { ...settings, maxRunsPerWeek: 2 },
      startDate: START,
    });
    const build = plan.weeks.find((w) => w.phase === "build" && !w.isDeload);
    const sessions = byWeek(plan.sessions, build?.index ?? -1);
    expect(sessions.map((s) => s.type).sort()).toEqual(["intervals", "long"]);
  });
});

describe("regeneration", () => {
  const today = addDays(START, 21);
  const base = generatePlan({ goal: goal("half", "intermediate"), settings, startDate: START });
  const existing = base.sessions.map((s, i) => ({
    id: `s${i}`,
    date: s.date,
    type: s.type,
    targetKm: s.targetKm,
    isUserEdited: false,
    hasActivity: false,
  }));

  it("only future, unedited, uncompleted sessions are replaced", () => {
    const edited = existing.find((s) => s.date > addDays(today, 7));
    const done = existing.find((s) => s.date === today) ?? existing.find((s) => s.date > today);
    if (!edited || !done) throw new Error("fixture");
    const stored = existing.map((s) =>
      s.id === edited.id ? { ...s, isUserEdited: true } : s.id === done.id ? { ...s, hasActivity: true } : s,
    );
    const regen = generatePlan({
      goal: goal("half", "intermediate", { raceDate: addDays(START, 18 * 7 + 6) }),
      settings,
      startDate: START,
      today,
      existingSessions: stored,
    });

    const past = stored.filter((s) => s.date < today).map((s) => s.id);
    for (const id of [...past, edited.id, done.id]) expect(regen.deleteIds).not.toContain(id);
    expect(regen.deleteIds.length).toBe(stored.length - past.length - 2);
    expect(regen.sessions.every((s) => s.date >= today)).toBe(true);
    expect(regen.sessions.some((s) => s.date === edited.date || s.date === done.date)).toBe(false);
  });

  it("regenerationFilter keeps frozen dates free", () => {
    const { keep, deleteIds } = regenerationFilter(
      [
        { ...base.sessions[0]!, date: "2026-11-10" },
        { ...base.sessions[0]!, date: "2026-11-11" },
      ],
      [{ id: "a", date: "2026-11-10", type: "easy", targetKm: 5, isUserEdited: true, hasActivity: false }],
      "2026-11-01",
    );
    expect(keep.map((s) => s.date)).toEqual(["2026-11-11"]);
    expect(deleteIds).toEqual([]);
  });
});
