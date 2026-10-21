import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays, localDateOf } from "@/lib/time";
import {
  acwrOn,
  acwrSeries,
  dailyLoads,
  effectiveRpe,
  hrZones,
  longRunProgression,
  predictRace,
  rpeFromHrr,
  sessionStatus,
  srpeLoad,
  timeInZones,
  weeklyVolume,
  type MetricActivity,
  type MetricSession,
} from ".";

const act = (o: Partial<MetricActivity> & { localDate: string }): MetricActivity => ({
  id: o.id ?? `a-${o.localDate}`,
  km: 5,
  seconds: 1800,
  rpe: null,
  avgHr: null,
  plannedSessionId: null,
  ...o,
});

const hr = { maxHr: 190, restHr: 50 };

describe("load", () => {
  it("sRPE = minutes × RPE", () => {
    expect(srpeLoad(3600, 5)).toBe(300);
  });

  it("RPE source priority: logged > heart rate > session type > default", () => {
    expect(effectiveRpe({ rpe: 7, avgHr: 180 }, hr, "easy")).toEqual({ rpe: 7, source: "logged" });
    // HRR = (148 − 50) / 140 = 0.7 → RPE 5
    expect(effectiveRpe({ rpe: null, avgHr: 148 }, hr, "easy")).toEqual({ rpe: 5, source: "heart_rate" });
    expect(effectiveRpe({ rpe: null, avgHr: 148 }, { maxHr: null, restHr: null }, "intervals")).toEqual({
      rpe: 7,
      source: "session_type",
    });
    expect(effectiveRpe({ rpe: null, avgHr: null }, hr, null)).toEqual({ rpe: 4, source: "default" });
  });

  it("HR→RPE is monotonic and clamped", () => {
    fc.assert(
      fc.property(fc.double({ min: -1, max: 2, noNaN: true }), fc.double({ min: -1, max: 2, noNaN: true }), (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(rpeFromHrr(lo)).toBeLessThanOrEqual(rpeFromHrr(hi) + 1e-9);
        expect(rpeFromHrr(lo)).toBeGreaterThanOrEqual(1);
        expect(rpeFromHrr(hi)).toBeLessThanOrEqual(10);
      }),
    );
  });
});

describe("ACWR", () => {
  const day0 = "2026-09-01";

  it("constant daily load with full history → ratio 1", () => {
    const loads = dailyLoads(Array.from({ length: 40 }, (_, i) => ({ date: addDays(day0, i), load: 100 })));
    const p = acwrOn(addDays(day0, 39), loads, day0);
    expect(p.acute).toBe(700);
    expect(p.chronic).toBe(700);
    expect(p.ratio).toBe(1);
    expect(p).toMatchObject({ flag: "ok", insufficientHistory: false });
  });

  it("a spike in the last week flags high; a quiet week flags low", () => {
    const base = Array.from({ length: 21 }, (_, i) => ({ date: addDays(day0, i), load: 100 }));
    const spike = Array.from({ length: 7 }, (_, i) => ({ date: addDays(day0, 21 + i), load: 300 }));
    const p = acwrOn(addDays(day0, 27), dailyLoads([...base, ...spike]), day0);
    // acute 2100, chronic (2100 + 2100) / 4 = 1050
    expect(p.ratio).toBe(2);
    expect(p.flag).toBe("high");

    const quiet = acwrOn(addDays(day0, 27), dailyLoads(base), day0);
    expect(quiet.ratio).toBe(0);
    expect(quiet.flag).toBe("low");
  });

  it("windows include the day itself and nothing older than 28 days", () => {
    const loads = dailyLoads([
      { date: "2026-10-01", load: 50 }, // 28th day back from 10-28 → inside chronic
      { date: "2026-09-30", load: 999 }, // 29th day back → outside
      { date: "2026-10-28", load: 70 }, // today → inside acute
    ]);
    const p = acwrOn("2026-10-28", loads, "2026-09-30");
    expect(p.acute).toBe(70);
    expect(p.chronic).toBe(120 / 4);
  });

  it("no load → null ratio; short history is flagged", () => {
    expect(acwrOn(day0, new Map(), null)).toMatchObject({ ratio: null, flag: null, insufficientHistory: true });
    const loads = dailyLoads([{ date: day0, load: 100 }]);
    expect(acwrOn(addDays(day0, 3), loads, day0).insufficientHistory).toBe(true);
  });

  it("is scale-invariant", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 600 }), { minLength: 28, maxLength: 60 }),
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        (daily, k) => {
          const mk = (f: number) => dailyLoads(daily.map((l, i) => ({ date: addDays(day0, i), load: l * f })));
          const end = addDays(day0, daily.length - 1);
          const a = acwrOn(end, mk(1), day0).ratio;
          const b = acwrOn(end, mk(k), day0).ratio;
          if (a === null) expect(b).toBeNull();
          else expect(b).toBeCloseTo(a, 9);
        },
      ),
    );
  });

  it("series covers every day in range", () => {
    expect(acwrSeries("2026-10-01", "2026-10-10", new Map())).toHaveLength(10);
  });
});

describe("weekly volume & compliance", () => {
  const sessions: MetricSession[] = [
    { id: "s1", date: "2026-10-13", type: "easy", targetKm: 6 },
    { id: "s2", date: "2026-10-15", type: "tempo", targetKm: 8 },
    { id: "s3", date: "2026-10-18", type: "long", targetKm: 14 },
    { id: "r", date: "2026-10-16", type: "rest", targetKm: 0 },
    { id: "s4", date: "2026-10-20", type: "easy", targetKm: 6 },
  ];

  it("caps each session's credit at its target and ignores future sessions", () => {
    const weeks = weeklyVolume({
      sessions,
      activities: [
        act({ localDate: "2026-10-13", km: 10, plannedSessionId: "s1" }), // overran: credit 6
        act({ localDate: "2026-10-17", km: 4 }), // unplanned: counts in actual only
        act({ localDate: "2026-10-18", km: 12, plannedSessionId: "s3" }),
      ],
      weekStart: 1,
      asOf: "2026-10-18",
    });
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toEqual({
      weekStart: "2026-10-12",
      plannedKm: 28,
      plannedToDateKm: 28,
      actualKm: 26,
      completedKm: 18,
      compliance: 18 / 28,
    });
    expect(weeks[1]).toMatchObject({ weekStart: "2026-10-19", plannedKm: 6, plannedToDateKm: 0, compliance: null });
  });

  it("respects the user's week start", () => {
    const weeks = weeklyVolume({ sessions, activities: [], weekStart: 7, asOf: "2026-10-31" });
    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-10-11", "2026-10-18"]);
  });

  it("compliance is always within [0, 1]", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ km: fc.double({ min: 0, max: 50, noNaN: true }), link: fc.constantFrom("s1", "s2", "s3", null) })),
        (runs) => {
          const weeks = weeklyVolume({
            sessions,
            activities: runs.map((r, i) => act({ id: `x${i}`, localDate: "2026-10-14", km: r.km, plannedSessionId: r.link })),
            weekStart: 1,
            asOf: "2026-10-31",
          });
          for (const w of weeks) {
            if (w.compliance === null) continue;
            expect(w.compliance).toBeGreaterThanOrEqual(0);
            expect(w.compliance).toBeLessThanOrEqual(1);
          }
        },
      ),
    );
  });

  it("session status and long-run progression", () => {
    expect(sessionStatus({ date: "2026-10-17", type: "easy" }, "2026-10-18", false)).toBe("missed");
    expect(sessionStatus({ date: "2026-10-17", type: "easy" }, "2026-10-18", true)).toBe("done");
    expect(sessionStatus({ date: "2026-10-18", type: "easy" }, "2026-10-18", false)).toBe("today");
    expect(sessionStatus({ date: "2026-10-19", type: "rest" }, "2026-10-18", false)).toBe("rest");
    expect(longRunProgression(sessions, [act({ localDate: "2026-10-18", km: 12, plannedSessionId: "s3" })])).toEqual([
      { date: "2026-10-18", plannedKm: 14, actualKm: 12 },
    ]);
  });
});

describe("race prediction", () => {
  it("uses the best comparable effort in the last 6 weeks (Riegel)", () => {
    const p = predictRace({
      goalKm: 21.0975,
      asOf: "2026-10-18",
      activities: [
        act({ id: "easy", localDate: "2026-10-10", km: 12, seconds: 12 * 360 }),
        act({ id: "tempo", localDate: "2026-10-14", km: 10, seconds: 2700 }), // 45:00 10K
        act({ id: "short", localDate: "2026-10-15", km: 4, seconds: 1000 }), // < 25% of a half → ignored
        act({ id: "old", localDate: "2026-08-01", km: 10, seconds: 2400 }), // outside 6 weeks
      ],
    });
    expect(p?.fromActivityId).toBe("tempo");
    // 2700 × (21.0975/10)^1.06 ≈ 5951 s ≈ 1:39:11
    expect(p?.predictedSeconds).toBeGreaterThan(5900);
    expect(p?.predictedSeconds).toBeLessThan(6000);
  });

  it("prefers hard efforts over faster-looking easy runs, and labels the fallback", () => {
    const activities = [
      act({ id: "easy-fast", localDate: "2026-10-10", km: 12, seconds: 12 * 290, rpe: 4 }),
      act({ id: "tempo", localDate: "2026-10-14", km: 10, seconds: 2800, plannedSessionId: "t" }),
      act({ id: "hr-hard", localDate: "2026-10-15", km: 8, seconds: 8 * 300, avgHr: 170 }), // HRR 0.86
    ];
    const types: Record<string, string> = { t: "tempo" };
    const p = predictRace({
      goalKm: 21.0975,
      asOf: "2026-10-18",
      activities,
      sessionTypeOf: (a) => (a.plannedSessionId ? (types[a.plannedSessionId] ?? null) : null),
      hr,
    });
    expect(p?.basis).toBe("hard");
    expect(["tempo", "hr-hard"]).toContain(p?.fromActivityId);

    const fallback = predictRace({ goalKm: 21.0975, asOf: "2026-10-18", activities: [activities[0] as MetricActivity], hr });
    expect(fallback).toMatchObject({ fromActivityId: "easy-fast", basis: "any" });
  });

  it("null without comparable runs", () => {
    expect(predictRace({ goalKm: 42.195, asOf: "2026-10-18", activities: [act({ localDate: "2026-10-17", km: 5 })] })).toBeNull();
  });
});

describe("HR zones (Karvonen)", () => {
  it("computes bounds from heart-rate reserve", () => {
    expect(hrZones(hr)).toEqual([
      { zone: 1, minBpm: 120, maxBpm: 134 },
      { zone: 2, minBpm: 134, maxBpm: 148 },
      { zone: 3, minBpm: 148, maxBpm: 162 },
      { zone: 4, minBpm: 162, maxBpm: 176 },
      { zone: 5, minBpm: 176, maxBpm: 190 },
    ]);
    expect(hrZones({ maxHr: null, restHr: 50 })).toBeNull();
  });

  it("time in zone sums to the covered duration and buckets correctly", () => {
    const zones = hrZones(hr);
    if (!zones) throw new Error();
    const t = timeInZones(
      [
        { t: 0, bpm: 100 },
        { t: 60, bpm: 140 },
        { t: 600, bpm: 180 },
      ],
      900,
      zones,
    );
    expect(t).toEqual([60, 0, 300, 0, 0, 300]); // the 540 s gap is capped at 300 s
  });

  it("never exceeds the activity duration", () => {
    const zones = hrZones(hr);
    if (!zones) throw new Error();
    fc.assert(
      fc.property(
        fc.array(fc.record({ t: fc.integer({ min: 0, max: 7200 }), bpm: fc.integer({ min: 60, max: 200 }) })),
        fc.integer({ min: 1, max: 7200 }),
        (samples, total) => {
          const inRange = samples.filter((s) => s.t <= total);
          const sum = timeInZones(inRange, total, zones).reduce((a, b) => a + b, 0);
          expect(sum).toBeLessThanOrEqual(total);
        },
      ),
    );
  });
});

describe("time zones", () => {
  it("assigns a late run to the user's local date", () => {
    const instant = new Date("2026-10-18T22:30:00Z");
    expect(localDateOf(instant, "Europe/Madrid")).toBe("2026-10-19");
    expect(localDateOf(instant, "America/Los_Angeles")).toBe("2026-10-18");
  });
});
