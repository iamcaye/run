import { EFFORT_DESCRIPTIONS, PLANNING, type DistanceKey, type SessionType } from "@/config/training";
import type { Phase, SessionStructure } from "../types";
import type { DayRole } from "./assign-days";
import type { QualityType } from "./template";
import { floorTo, roundTo } from "./volume";

export type SizedSession = {
  date: string;
  type: SessionType;
  km: number;
  structure: SessionStructure | null;
  /** Which pace each structure step / the session should get once paces are known. */
  paceKind: SessionType;
  effortDescription: string;
};

const Q = PLANNING.quality;
const STEP = PLANNING.roundingKm;

function longShare(runs: number, distanceKey: DistanceKey): number {
  if (distanceKey === "half" || distanceKey === "marathon") return PLANNING.longRun.shareLongDistances;
  const s = PLANNING.longRun.shareByRuns;
  return runs <= 3 ? s.upTo3 : runs === 4 ? s.four : s.fivePlus;
}

/** Quality session with fixed warmup + main set + cooldown. Paces are filled in later. */
export function qualitySession(type: QualityType, weekKm: number, distanceKey: DistanceKey, phase: Phase) {
  const taper = phase === "taper" ? Q.taperMainSetFraction : 1;
  const wu = Q.warmupKm;
  const cd = Q.cooldownKm;
  let main: SessionStructure["steps"][number];
  let mainKm: number;

  if (type === "intervals") {
    const repKm = Q.intervals.repKm[distanceKey];
    const reps = Math.max(
      Q.intervals.minReps,
      Math.min(Q.intervals.maxReps, Math.round((weekKm * Q.intervals.shareOfWeek * taper) / repKm)),
    );
    main = { kind: "reps", reps, repKm, zone: "intervals", recoverySeconds: Q.intervals.recoverySeconds, effort: EFFORT_DESCRIPTIONS.intervals };
    mainKm = reps * (repKm + Q.intervals.recoveryKm);
  } else {
    const cfg = type === "tempo" ? Q.tempo : { ...Q.racePace, maxKm: Q.racePace.maxKm[distanceKey] };
    mainKm = roundTo(Math.max(cfg.minKm, Math.min(cfg.maxKm, weekKm * cfg.shareOfWeek * taper)));
    main = { kind: "steady", km: mainKm, zone: type, effort: EFFORT_DESCRIPTIONS[type] };
  }

  const structure: SessionStructure = {
    steps: [{ kind: "warmup", km: wu }, main, { kind: "cooldown", km: cd }],
  };
  return { km: roundTo(wu + mainKm + cd), structure };
}

export function stridesStructure(km: number): SessionStructure {
  const s = PLANNING.strides;
  return {
    steps: [
      { kind: "steady", km, zone: "easy", effort: EFFORT_DESCRIPTIONS.easy },
      { kind: "reps", reps: s.reps, repSeconds: s.repSeconds, recoverySeconds: s.recoverySeconds, effort: "Relaxed, fast, smooth — RPE 7" },
    ],
  };
}

/**
 * Turns a week's day roles into km. Guarantees: the week total never exceeds `weekKm`, the long
 * run respects its cap and +2 km/week, easy runs are ≥ minEasyRunKm (or dropped).
 */
export function sizeSessions(input: {
  roles: readonly DayRole[];
  /** Km left to schedule this week. */
  weekKm: number;
  /** Full-week target that long-run share and quality sizes are based on (defaults to weekKm). */
  referenceWeekKm?: number;
  phase: Phase;
  distanceKey: DistanceKey;
  raceKm: number;
  /** Last non-deload long run (km), or null for the first one. */
  longRef: number | null;
  longRacePaceFinish: boolean;
}): { sessions: SizedSession[]; longKm: number | null; droppedQuality: number } {
  const { roles, weekKm, phase, distanceKey, raceKm, longRef, longRacePaceFinish } = input;
  const refKm = input.referenceWeekKm ?? weekKm;
  const cap = PLANNING.longRun.capKm[distanceKey];
  // The share cap only makes sense when there are other runs to carry the rest of the week.
  const onlyRun = roles.filter((r) => r.role !== "race").length === 1;
  const shareCap = onlyRun ? weekKm : Math.min(weekKm, floorTo(refKm * PLANNING.longRun.shareOfWeek[1]));
  const longLimit = (km: number) =>
    Math.min(cap, longRef === null ? km : longRef + PLANNING.longRun.maxIncreaseKmPerWeek, shareCap);

  const race = roles.find((r) => r.role === "race");
  const longRole = roles.find((r) => r.role === "long");
  const quality = roles.filter((r): r is Extract<DayRole, { role: "quality" }> => r.role === "quality");
  let easy = roles.filter((r): r is Extract<DayRole, { role: "easy" }> => r.role === "easy");

  // Race week: the race eats into the budget first.
  let budget = weekKm - (race ? raceKm : 0);

  let longKm = longRole
    ? Math.max(0, Math.min(roundTo(refKm * longShare(roles.length, distanceKey)), longLimit(weekKm)))
    : 0;
  if (longRole && longKm < PLANNING.minEasyRunKm) longKm = Math.min(PLANNING.minEasyRunKm, Math.max(0, floorTo(budget)));
  budget -= longKm;

  // Size quality; if the week can't afford them, convert the lowest-priority ones to easy runs.
  const sizedQuality = quality.map((q) => ({ role: q, ...qualitySession(q.type, refKm, distanceKey, phase) }));
  let droppedQuality = 0;
  while (sizedQuality.length > 0 && sizedQuality.reduce((s, q) => s + q.km, 0) > budget) {
    const dropped = sizedQuality.pop();
    if (dropped) easy = [...easy, { role: "easy", date: dropped.role.date, strides: false }];
    droppedQuality++;
  }
  budget -= sizedQuality.reduce((s, q) => s + q.km, 0);

  // Easy runs split the rest evenly in 0.5 km units; too-short ones are dropped, and none may
  // outgrow the long run.
  const minEasy = race ? PLANNING.raceWeekShakeoutMinKm : PLANNING.minEasyRunKm;
  easy = [...easy].sort((a, b) => a.date.localeCompare(b.date));
  while (easy.length > 0 && budget / easy.length < minEasy) {
    // Keep the strides run if possible; drop the latest plain easy run.
    const idx = findLastIndex(easy, (e) => !e.strides);
    easy.splice(idx === -1 ? easy.length - 1 : idx, 1);
  }
  const easyCap = longKm > 0 ? floorTo(longKm * PLANNING.maxEasyFractionOfLong) : Number.POSITIVE_INFINITY;
  const easyKm: number[] = [];
  if (easy.length > 0) {
    const units = Math.floor(Math.min(budget, easyCap * easy.length) / STEP + 1e-9);
    const each = Math.floor(units / easy.length);
    const extra = units - each * easy.length;
    easy.forEach((_, i) => easyKm.push((each + (i < extra ? 1 : 0)) * STEP));
    budget -= easyKm.reduce((s, k) => s + k, 0);
  }
  if (longRole && longKm > 0 && budget > 0) {
    // Leftover goes to the long run within its limits; anything beyond that is left out.
    longKm = Math.max(longKm, Math.min(longLimit(weekKm), floorTo(longKm + budget)));
  }

  const sessions: SizedSession[] = [];
  if (race) {
    sessions.push({ date: race.date, type: "race", km: raceKm, structure: null, paceKind: "race", effortDescription: EFFORT_DESCRIPTIONS.race });
  }
  if (longRole && longKm > 0) {
    const finishKm = longRacePaceFinish ? roundTo(longKm * PLANNING.longRun.racePaceFinishShare) : 0;
    sessions.push({
      date: longRole.date,
      type: "long",
      km: longKm,
      structure:
        finishKm > 0
          ? {
              steps: [
                { kind: "steady", km: longKm - finishKm, zone: "long", effort: EFFORT_DESCRIPTIONS.long },
                { kind: "steady", km: finishKm, zone: "race_pace", effort: EFFORT_DESCRIPTIONS.race_pace },
              ],
            }
          : null,
      paceKind: "long",
      effortDescription: finishKm > 0 ? EFFORT_DESCRIPTIONS.long_race_pace_finish : EFFORT_DESCRIPTIONS.long,
    });
  }
  for (const q of sizedQuality) {
    sessions.push({
      date: q.role.date,
      type: q.role.type,
      km: q.km,
      structure: q.structure,
      paceKind: q.role.type,
      effortDescription: EFFORT_DESCRIPTIONS[q.role.type],
    });
  }
  easy.forEach((e, i) => {
    const km = easyKm[i] ?? 0;
    sessions.push({
      date: e.date,
      type: e.strides ? "strides" : "easy",
      km,
      structure: e.strides ? stridesStructure(km) : null,
      paceKind: "easy",
      effortDescription: e.strides ? EFFORT_DESCRIPTIONS.strides : EFFORT_DESCRIPTIONS.easy,
    });
  });

  sessions.sort((a, b) => a.date.localeCompare(b.date));
  return { sessions, longKm: longRole && longKm > 0 ? longKm : null, droppedQuality };
}

function findLastIndex<T>(arr: readonly T[], pred: (t: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i] as T)) return i;
  return -1;
}
