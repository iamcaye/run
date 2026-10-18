import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays, daysBetween, startOfWeek } from "@/lib/time";
import { generatePlan } from "./generate";
import { goalInputArb, settingsArb } from "./test-arbitraries";
import { HARD_TYPES, isFrozen, type ExistingSession } from "./types";

const RUNS = { numRuns: Number(process.env.FC_RUNS ?? 300) };
const EPS = 1e-6;

/** A stored plan, a "today" inside it, and random user edits (kept as-is, some moved). */
const scenarioArb = fc
  .tuple(goalInputArb, settingsArb, fc.double({ min: 0, max: 1, noNaN: true }), fc.array(fc.nat(), { maxLength: 6 }), fc.array(fc.integer({ min: -3, max: 3 }), { maxLength: 6 }))
  .map(([{ goal, startDate }, settings, todayFrac, editPicks, moves]) => {
    const original = generatePlan({ goal, settings, startDate });
    const span = Math.max(0, daysBetween(startDate, goal.raceDate));
    const today = addDays(startDate, Math.floor(todayFrac * span));
    let existing: ExistingSession[] = original.sessions.map((s, i) => ({
      id: `s${i}`,
      date: s.date,
      type: s.type,
      targetKm: s.targetKm,
      isUserEdited: false,
      hasActivity: false,
    }));
    editPicks.forEach((pick, k) => {
      if (existing.length === 0) return;
      const target = existing[pick % existing.length];
      if (!target || target.type === "race") return;
      const moved = addDays(target.date, moves[k] ?? 0);
      if (moved > goal.raceDate || existing.some((e) => e.date === moved && e.id !== target.id)) return;
      existing = existing.map((e) => (e.id === target.id ? { ...e, date: moved, isUserEdited: true } : e));
    });
    return { goal, settings, startDate, today, existing };
  });

describe("regeneration around kept sessions (property-based)", () => {
  it("never double-books a day, never adds hard days next to hard/long days, respects run limits and volume", () => {
    fc.assert(
      fc.property(scenarioArb, ({ goal, settings, startDate, today, existing }) => {
        const regen = generatePlan({ goal, settings, startDate, today, existingSessions: existing });
        const kept = existing.filter((s) => isFrozen(s, today));
        const fresh = regen.sessions;

        // Deleted = exactly the non-frozen ones; new sessions only from today on.
        expect(new Set(regen.deleteIds)).toEqual(new Set(existing.filter((s) => !isFrozen(s, today)).map((s) => s.id)));
        expect(fresh.every((s) => s.date >= today)).toBe(true);

        const all = [...kept.map((s) => ({ ...s, fresh: false })), ...fresh.map((s) => ({ ...s, fresh: true }))];
        expect(new Set(all.map((s) => s.date)).size).toBe(all.length);

        // New hard sessions keep their spacing from everything (kept or new).
        const hard = all.filter((s) => HARD_TYPES.has(s.type));
        const longs = all.filter((s) => s.type === "long");
        for (const h of fresh.filter((s) => HARD_TYPES.has(s.type) && s.type !== "race")) {
          for (const o of hard) if (o.date !== h.date) expect(Math.abs(daysBetween(o.date, h.date))).toBeGreaterThan(1);
          for (const l of longs) expect(Math.abs(daysBetween(l.date, h.date))).toBeGreaterThan(1);
        }

        // Per week: new sessions only fill the room the kept ones leave.
        for (const w of regen.weeks) {
          const start = w.start;
          const inWeek = (d: string) => startOfWeek(d, settings.weekStart) === start;
          const keptIn = kept.filter((s) => inWeek(s.date));
          const freshIn = fresh.filter((s) => inWeek(s.date));
          if (freshIn.length === 0) continue;
          // The race is always scheduled, even if kept sessions already fill the week's run slots.
          const freshRuns = freshIn.filter((s) => s.type !== "race").length;
          expect(keptIn.length + freshRuns).toBeLessThanOrEqual(Math.max(settings.maxRunsPerWeek, keptIn.length));
          if (w.phase !== "race") {
            const keptKm = keptIn.reduce((a, s) => a + s.targetKm, 0);
            const freshKm = freshIn.reduce((a, s) => a + s.targetKm, 0);
            expect(freshKm).toBeLessThanOrEqual(Math.max(0, w.targetKm - keptKm) + EPS);
          }
        }
      }),
      RUNS,
    );
  });
});
