import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { distanceKeyFor, PLANNING } from "@/config/training";
import { daysBetween, isoWeekday } from "@/lib/time";
import { generatePlan } from "./generate";
import { goalInputArb, settingsArb } from "./test-arbitraries";
import { HARD_TYPES } from "./types";

// FC_RUNS=5000 pnpm test:unit for a deeper search.
const RUNS = { numRuns: Number(process.env.FC_RUNS ?? 400) };
const EPS = 1e-6;

const planArb = fc.tuple(goalInputArb, settingsArb).map(([{ goal, startDate }, settings]) => ({
  input: { goal, settings, startDate },
  plan: generatePlan({ goal, settings, startDate }),
}));

describe("generatePlan invariants (property-based)", () => {
  it("no week's volume exceeds +10% over the previous non-deload week", () => {
    fc.assert(
      fc.property(planArb, ({ plan }) => {
        let ref: number | null = null;
        for (const w of plan.weeks) {
          if (w.phase === "race") continue; // the race itself isn't training load
          if (ref !== null) expect(w.targetKm).toBeLessThanOrEqual(ref * (1 + PLANNING.maxWeeklyIncrease) + EPS);
          if (!w.isDeload) ref = w.targetKm;
        }
      }),
      RUNS,
    );
  });

  it("scheduled sessions never exceed their week's target (outside race week)", () => {
    fc.assert(
      fc.property(planArb, ({ plan }) => {
        for (const w of plan.weeks) {
          if (w.phase === "race") continue;
          const total = plan.sessions.filter((s) => s.weekIndex === w.index).reduce((a, s) => a + s.targetKm, 0);
          expect(total).toBeLessThanOrEqual(w.targetKm + EPS);
        }
      }),
      RUNS,
    );
  });

  it("the long run never exceeds the distance cap, nor +2 km over the longest one so far", () => {
    fc.assert(
      fc.property(planArb, ({ input, plan }) => {
        const cap = PLANNING.longRun.capKm[distanceKeyFor(input.goal.distanceKm)];
        let longest: number | null = null;
        for (const s of plan.sessions.filter((x) => x.type === "long")) {
          expect(s.targetKm).toBeLessThanOrEqual(cap + EPS);
          if (longest !== null) {
            expect(s.targetKm).toBeLessThanOrEqual(longest + PLANNING.longRun.maxIncreaseKmPerWeek + EPS);
          }
          longest = Math.max(longest ?? 0, s.targetKm);
        }
      }),
      RUNS,
    );
  });

  it("no hard days back-to-back, and no hard day adjacent to (or on) a long run", () => {
    fc.assert(
      fc.property(planArb, ({ plan }) => {
        const hard = plan.sessions.filter((s) => HARD_TYPES.has(s.type)).map((s) => s.date).sort();
        for (let i = 1; i < hard.length; i++) {
          expect(daysBetween(hard[i - 1] as string, hard[i] as string)).toBeGreaterThan(1);
        }
        const longs = plan.sessions.filter((s) => s.type === "long").map((s) => s.date);
        for (const h of hard) for (const l of longs) expect(Math.abs(daysBetween(h, l))).toBeGreaterThan(1);
      }),
      RUNS,
    );
  });

  it("sessions fall only on run days (race excepted), at most one per day, within the plan window", () => {
    fc.assert(
      fc.property(planArb, ({ input, plan }) => {
        const dates = plan.sessions.map((s) => s.date);
        expect(new Set(dates).size).toBe(dates.length);
        for (const s of plan.sessions) {
          expect(s.date >= input.startDate && s.date <= input.goal.raceDate).toBe(true);
          if (s.type !== "race") expect(input.settings.runDays).toContain(isoWeekday(s.date));
        }
      }),
      RUNS,
    );
  });

  it("weekly runs ≤ maxRunsPerWeek", () => {
    fc.assert(
      fc.property(planArb, ({ input, plan }) => {
        for (const w of plan.weeks) {
          const runs = plan.sessions.filter((s) => s.weekIndex === w.index && s.type !== "rest").length;
          expect(runs).toBeLessThanOrEqual(input.settings.maxRunsPerWeek);
        }
      }),
      RUNS,
    );
  });

  it("race week is last and contains the race on raceDate", () => {
    fc.assert(
      fc.property(planArb, ({ input, plan }) => {
        const last = plan.weeks.at(-1);
        expect(last?.phase).toBe("race");
        const races = plan.sessions.filter((s) => s.type === "race");
        expect(races).toHaveLength(1);
        expect(races[0]?.date).toBe(input.goal.raceDate);
        expect(races[0]?.weekIndex).toBe(last?.index);
        expect(races[0]?.targetKm).toBe(input.goal.distanceKm);
      }),
      RUNS,
    );
  });

  it("beginners get at most one quality session per week", () => {
    fc.assert(
      fc.property(planArb, ({ input, plan }) => {
        if (input.goal.level !== "beginner") return;
        for (const w of plan.weeks) {
          const q = plan.sessions.filter(
            (s) => s.weekIndex === w.index && (s.type === "tempo" || s.type === "intervals" || s.type === "race_pace"),
          );
          expect(q.length).toBeLessThanOrEqual(1);
        }
      }),
      RUNS,
    );
  });

  it("is deterministic", () => {
    fc.assert(
      fc.property(goalInputArb, settingsArb, ({ goal, startDate }, settings) => {
        expect(generatePlan({ goal, settings, startDate })).toEqual(generatePlan({ goal, settings, startDate }));
      }),
      { numRuns: 100 },
    );
  });
});
