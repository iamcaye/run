/**
 * Builds realistic Health Auto Export payloads for demo users and sends them through the real
 * import pipeline (so seeded data exercises the same code as production).
 */
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { addDays, isoWeekday, type LocalDate } from "@/lib/time";
import type { PlannedSession } from "@/server/dal";

/** Small deterministic PRNG so seeds are reproducible. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

type Ctx = { timeZone: string; center: { lat: number; lon: number }; rand: () => number };

const haeDate = (d: Date, tz: string) => format(new TZDate(d, tz), "yyyy-MM-dd HH:mm:ss xx");

/** One HAE workout: a loop route (a point every ~100 m) and per-minute HR samples. */
function buildWorkout(
  ctx: Ctx,
  w: { id: string; date: LocalDate; hour: number; km: number; paceSecPerKm: number; avgHr: number },
): Record<string, unknown> {
  const seconds = Math.round(w.km * w.paceSecPerKm);
  const minute = String(Math.floor(ctx.rand() * 50)).padStart(2, "0");
  const start = new TZDate(`${w.date}T${String(w.hour).padStart(2, "0")}:${minute}:00`, ctx.timeZone);
  const end = new Date(start.getTime() + seconds * 1000);

  const points = Math.max(8, Math.round(w.km * 10));
  const radiusDeg = w.km / (2 * Math.PI) / 111;
  const route = Array.from({ length: points }, (_, i) => {
    const angle = (2 * Math.PI * i) / points;
    return {
      lat: ctx.center.lat + radiusDeg * Math.sin(angle),
      lon: ctx.center.lon + (radiusDeg * Math.cos(angle)) / Math.cos((ctx.center.lat * Math.PI) / 180),
      altitude: 20 + 5 * Math.sin(angle * 3),
      timestamp: haeDate(new Date(start.getTime() + (seconds * 1000 * i) / points), ctx.timeZone),
    };
  });
  const heartRateData = Array.from({ length: Math.ceil(seconds / 60) }, (_, m) => ({
    date: haeDate(new Date(start.getTime() + m * 60_000), ctx.timeZone),
    Avg: Math.round(Math.min(w.avgHr + 12, 105 + (w.avgHr - 105) * Math.min(1, m / 8) + (ctx.rand() - 0.5) * 6)),
    units: "count/min",
  }));

  return {
    id: w.id,
    name: "Outdoor Run",
    start: haeDate(start, ctx.timeZone),
    end: haeDate(end, ctx.timeZone),
    duration: seconds,
    distance: { qty: Math.round(w.km * 100) / 100, units: "km" },
    avgHeartRate: { qty: w.avgHr, units: "bpm" },
    maxHeartRate: { qty: w.avgHr + 14, units: "bpm" },
    heartRateData,
    route,
  };
}

export type DemoRunProfile = {
  center: { lat: number; lon: number };
  /** Easy pace (s/km); also the fallback for effort-only plans. */
  easyPace: number;
  /** Share of past planned sessions actually run. */
  completion: number;
  seed: number;
  /** Weeks of unplanned running before the plan starts (gives ACWR its 28-day history). */
  preplanWeeks: number;
  /** One faster run per pre-plan week at this pace and HR (null: easy only). */
  preplanHard: { paceSecPerKm: number; avgHr: number; km: number } | null;
};

export function demoWorkouts(input: {
  sessions: readonly PlannedSession[];
  today: LocalDate;
  timeZone: string;
  runDays: readonly number[];
  startWeeklyKm: number;
  profile: DemoRunProfile;
}): Record<string, unknown>[] {
  const { profile } = input;
  const ctx: Ctx = { timeZone: input.timeZone, center: profile.center, rand: rng(profile.seed) };
  const workouts: Record<string, unknown>[] = [];

  // Pre-plan base: easy runs on the usual run days, ~startWeeklyKm per week.
  const planStart = input.sessions[0]?.date ?? input.today;
  const preStart = addDays(planStart, -profile.preplanWeeks * 7);
  const perRun = input.startWeeklyKm / Math.max(1, input.runDays.length);
  let hardDoneWeek = -1;
  for (let d = preStart; d < planStart; d = addDays(d, 1)) {
    if (!input.runDays.includes(isoWeekday(d)) || ctx.rand() < 0.15) continue;
    const week = Math.floor((Date.parse(d) - Date.parse(preStart)) / (7 * 86_400_000));
    const hard = profile.preplanHard && hardDoneWeek !== week && isoWeekday(d) <= 4 ? profile.preplanHard : null;
    if (hard) hardDoneWeek = week;
    workouts.push(
      buildWorkout(ctx, {
        id: `demo-pre-${d}`,
        date: d,
        hour: 19,
        km: hard ? hard.km : Math.max(3, perRun * (0.85 + ctx.rand() * 0.3)),
        paceSecPerKm: hard ? hard.paceSecPerKm : profile.easyPace * (0.97 + ctx.rand() * 0.06),
        avgHr: hard ? hard.avgHr : Math.round(140 + ctx.rand() * 8),
      }),
    );
  }

  // Planned sessions in the past: most of them run, close to target.
  for (const s of input.sessions) {
    if (s.date >= input.today || s.type === "rest" || s.type === "race") continue;
    if (ctx.rand() > profile.completion) continue;
    const hard = ["tempo", "intervals", "race_pace"].includes(s.type);
    workouts.push(
      buildWorkout(ctx, {
        id: `demo-${s.id}`,
        date: s.date,
        hour: s.type === "long" ? 8 : 19,
        km: Math.max(2, s.targetKm * (0.92 + ctx.rand() * 0.16)),
        paceSecPerKm: (s.targetPaceSecPerKm ?? profile.easyPace) * (0.97 + ctx.rand() * 0.07),
        avgHr: Math.round((hard ? 158 : 142) + ctx.rand() * 8),
      }),
    );
  }
  return workouts;
}
