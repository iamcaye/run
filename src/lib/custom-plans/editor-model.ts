/**
 * Pure model behind the workout editor: converts stored steps (km, sec/km) to what the editor
 * shows (user units) and back, and implements the editor's stepping/toggling rules.
 * `fromDisplay` clamps everything into `stepSchema`'s bounds, so the editor can never emit an
 * invalid step whatever the user types.
 */
import { EDITOR_DEFAULTS as D, EDITOR_STEPS as S, WORKOUT_ESTIMATE as E, WORKOUT_LIMITS as L } from "@/config/training";
import type { HrZone, PaceZone, RecoveryKind, StepTarget, StructureStep } from "@/lib/planning/types";
import { formatDistance, fromDisplayDistance, KM_PER_MI, parseDuration, toDisplayDistance, type Units } from "@/lib/units";
import { estimateWorkout } from "./estimate";

export type BlockKind = StructureStep["kind"];
export type Measure = "distance" | "time";
/** `value` is a distance in the user's units, or seconds. */
export type Amount = { measure: Measure; value: number };

/** Pace is seconds per user unit (km or mi), unrounded so stored values round-trip exactly. */
export type DisplayTarget =
  | { kind: "none" }
  | { kind: "pace"; secPerUnit: number }
  | { kind: "hr_zone"; zone: HrZone }
  | { kind: "rpe"; rpe: number };
export type TargetKind = DisplayTarget["kind"];

/** Fields of generated steps the editor has no control for; kept as-is. */
type Legacy = { zone?: PaceZone; effort?: string };

export type BlockDisplay =
  | { kind: "warmup" | "steady" | "cooldown"; amount: Amount; target: DisplayTarget; legacy?: Legacy }
  | {
      kind: "reps";
      reps: number;
      amount: Amount;
      target: DisplayTarget;
      recovery: Amount;
      recoveryKind: RecoveryKind;
      legacy?: Legacy;
    };

export type Bounds = { step: number; min: number; max: number };

const unitFactor = (units: Units) => (units === "mi" ? KM_PER_MI : 1);

/** Strips binary float noise (0.1 + 0.2) without visibly rounding anything. */
const clean = (n: number) => Math.round(n * 1e9) / 1e9;

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return n === Number.POSITIVE_INFINITY ? hi : lo;
  return Math.min(hi, Math.max(lo, n));
}

export function newBlock(kind: BlockKind): StructureStep {
  switch (kind) {
    case "warmup":
      return { kind, km: D.warmupKm };
    case "cooldown":
      return { kind, km: D.cooldownKm };
    case "steady":
      return { kind, km: D.steadyKm };
    case "reps":
      return { kind, ...D.reps };
  }
}

// --- bounds -----------------------------------------------------------------------------------

export function distanceBounds(kind: BlockKind | "recovery", units: Units): Bounds {
  const step = kind === "reps" || kind === "recovery" ? (units === "mi" ? S.repDistanceMi : S.repDistanceKm) : S.distance;
  return { step, min: D.minDistance, max: toDisplayDistance(L.maxKm, units) };
}

export function timeBounds(kind: BlockKind | "recovery"): Bounds {
  const step = kind === "reps" || kind === "recovery" ? S.recoverySeconds : S.blockSeconds;
  return { step, min: D.minSeconds, max: L.maxSeconds };
}

/** Pace bounds in seconds per user unit. */
export function paceBounds(units: Units): Bounds {
  const f = unitFactor(units);
  return { step: S.paceSeconds, min: L.minPaceSecPerKm * f, max: L.maxPaceSecPerKm * f };
}

export const REPS_BOUNDS: Bounds = { step: 1, min: 1, max: L.maxReps };
export const RPE_BOUNDS: Bounds = { step: 1, min: 1, max: 10 };

// --- storage → display ------------------------------------------------------------------------

function amountOf(km: number | undefined, seconds: number | undefined, defaultKm: number, units: Units): Amount {
  if (km !== undefined) return { measure: "distance", value: toDisplayDistance(km, units) };
  if (seconds !== undefined) return { measure: "time", value: seconds };
  return { measure: "distance", value: toDisplayDistance(defaultKm, units) };
}

function targetOf(target: StepTarget | undefined, paceSecPerKm: number | undefined, units: Units): DisplayTarget {
  if (target?.kind === "pace") return { kind: "pace", secPerUnit: target.secPerKm * unitFactor(units) };
  if (target) return target;
  if (paceSecPerKm) return { kind: "pace", secPerUnit: paceSecPerKm * unitFactor(units) };
  return { kind: "none" };
}

function legacyOf(s: { zone?: PaceZone; effort?: string }): Legacy | undefined {
  if (s.zone === undefined && s.effort === undefined) return undefined;
  return { ...(s.zone !== undefined && { zone: s.zone }), ...(s.effort !== undefined && { effort: s.effort }) };
}

export function toDisplay(step: StructureStep, units: Units): BlockDisplay {
  switch (step.kind) {
    case "warmup":
    case "cooldown":
      return { kind: step.kind, amount: amountOf(step.km, step.seconds, D.warmupKm, units), target: targetOf(step.target, undefined, units) };
    case "steady": {
      const legacy = legacyOf(step);
      return {
        kind: "steady",
        amount: amountOf(step.km, step.seconds, D.steadyKm, units),
        target: targetOf(step.target, step.paceSecPerKm, units),
        ...(legacy && { legacy }),
      };
    }
    case "reps": {
      const legacy = legacyOf(step);
      const recovery: Amount =
        step.recoveryKm !== undefined
          ? { measure: "distance", value: toDisplayDistance(step.recoveryKm, units) }
          : { measure: "time", value: step.recoverySeconds ?? D.reps.recoverySeconds };
      return {
        kind: "reps",
        reps: step.reps,
        amount: amountOf(step.repKm, step.repSeconds, D.reps.repKm, units),
        target: targetOf(step.target, step.paceSecPerKm, units),
        recovery,
        recoveryKind: step.recoveryKind ?? D.reps.recoveryKind,
        ...(legacy && { legacy }),
      };
    }
  }
}

// --- display → storage ------------------------------------------------------------------------

function kmFrom(value: number, units: Units): number {
  return clamp(fromDisplayDistance(value, units), fromDisplayDistance(D.minDistance, units), L.maxKm);
}

function secondsFrom(value: number): number {
  return clamp(Math.round(value), D.minSeconds, L.maxSeconds);
}

function targetFrom(t: DisplayTarget, units: Units): StepTarget | undefined {
  switch (t.kind) {
    case "none":
      return undefined;
    case "pace":
      return {
        kind: "pace",
        secPerKm: clamp(Math.round(t.secPerUnit / unitFactor(units)), L.minPaceSecPerKm, L.maxPaceSecPerKm),
      };
    case "hr_zone":
      return { kind: "hr_zone", zone: t.zone };
    case "rpe":
      return { kind: "rpe", rpe: clamp(Math.round(t.rpe), RPE_BOUNDS.min, RPE_BOUNDS.max) };
  }
}

export function fromDisplay(d: BlockDisplay, units: Units): StructureStep {
  const target = targetFrom(d.target, units);
  const withTarget = target ? { target } : {};
  const legacy = d.kind === "steady" || d.kind === "reps" ? (d.legacy ?? {}) : {};
  switch (d.kind) {
    case "warmup":
    case "cooldown":
    case "steady": {
      const size = d.amount.measure === "distance" ? { km: kmFrom(d.amount.value, units) } : { seconds: secondsFrom(d.amount.value) };
      return { kind: d.kind, ...size, ...legacy, ...withTarget };
    }
    case "reps": {
      const rep =
        d.amount.measure === "distance" ? { repKm: kmFrom(d.amount.value, units) } : { repSeconds: secondsFrom(d.amount.value) };
      const recovery =
        d.recovery.measure === "distance"
          ? { recoveryKm: kmFrom(d.recovery.value, units) }
          : { recoverySeconds: secondsFrom(d.recovery.value) };
      return {
        kind: "reps",
        reps: clamp(Math.round(d.reps), REPS_BOUNDS.min, REPS_BOUNDS.max),
        ...rep,
        ...legacy,
        ...withTarget,
        ...recovery,
        recoveryKind: d.recoveryKind,
      };
    }
  }
}

// --- editing operations -----------------------------------------------------------------------

/** Rounds to the nearest multiple of `step`, at least one step and at most `max`. */
function snap(value: number, step: number, max: number): number {
  return clamp(clean(Math.round(value / step) * step), step, max);
}

/**
 * Next value for a −/+ press: moves to the next multiple of `step` (so 1.24 + 0.5 → 1.5).
 * A press that would go below `min` (default: one step) or a no-op leaves the value unchanged.
 */
export function stepValue(value: number, step: number, dir: 1 | -1, max: number, min = step): number {
  const eps = 1e-9;
  const k = value / step;
  const next = clean(dir > 0 ? (Math.floor(k + eps) + 1) * step : (Math.ceil(k - eps) - 1) * step);
  if (next < min - eps) return value;
  return Math.min(max, next);
}

/**
 * −/+ on a pace (seconds per user unit). Stored paces are whole sec/km, so in miles a 5 s step
 * can round back to the same stored value; keep stepping until the stored pace actually changes.
 */
export function stepPace(secPerUnit: number, dir: 1 | -1, units: Units): number {
  const f = unitFactor(units);
  const { step, min, max } = paceBounds(units);
  const stored = Math.round(secPerUnit / f);
  let v = secPerUnit;
  for (let i = 0; i < 3; i++) {
    const next = stepValue(v, step, dir, max, min);
    if (next === v) return v;
    v = next;
    if (Math.round(v / f) !== stored) return v;
  }
  return v;
}

/** Switches a block between distance and time, keeping it roughly the same size. */
export function toggleMeasure(d: BlockDisplay, units: Units): BlockDisplay {
  const step = fromDisplay(d, units);
  const one = estimateWorkout([step.kind === "reps" ? { ...step, reps: 1 } : step]);
  if (d.amount.measure === "distance") {
    const b = timeBounds(d.kind);
    return { ...d, amount: { measure: "time", value: snap(one.seconds, b.step, b.max) } };
  }
  const b = distanceBounds(d.kind, units);
  return { ...d, amount: { measure: "distance", value: snap(toDisplayDistance(one.km, units), b.step, b.max) } };
}

/** Switches a repeat's recovery between time and distance at the recovery kind's pace. */
export function toggleRecoveryMeasure(d: BlockDisplay, units: Units): BlockDisplay {
  if (d.kind !== "reps") return d;
  const pace = E.recoverySecPerKm[d.recoveryKind] ?? E.recoverySecPerKm.jog;
  if (d.recovery.measure === "time") {
    const b = distanceBounds("recovery", units);
    return { ...d, recovery: { measure: "distance", value: snap(toDisplayDistance(d.recovery.value / pace, units), b.step, b.max) } };
  }
  const b = timeBounds("recovery");
  return { ...d, recovery: { measure: "time", value: snap(fromDisplayDistance(d.recovery.value, units) * pace, b.step, b.max) } };
}

/** Picks a target kind, starting from a sensible value for the block's intensity. */
export function switchTarget(d: BlockDisplay, kind: TargetKind, units: Units): BlockDisplay {
  if (d.target.kind === kind) return d;
  const work = d.kind === "reps" ? "work" : "easy";
  const target: DisplayTarget = (() => {
    switch (kind) {
      case "none":
        return { kind };
      case "pace": {
        const secPerKm = work === "work" ? E.untargetedRepSecPerKm : E.easySecPerKm;
        return { kind, secPerUnit: snap(secPerKm * unitFactor(units), S.paceSeconds, paceBounds(units).max) };
      }
      case "hr_zone":
        return { kind, zone: D.zone[work] };
      case "rpe":
        return { kind, rpe: D.rpe[work] };
    }
  })();
  return { ...d, target };
}

// --- parsing & formatting ---------------------------------------------------------------------

/** Tolerant "m:ss" pace parser ("4:05", "4:5", "4.05", "4", "4:05 /km") → seconds per unit. */
export function parsePace(input: string): number | null {
  const m = /^(\d{1,2})(?:\s*[:.'′]\s*(\d{1,2}))?$/.exec(input.replace(/\/?\s*(min)?\s*\/?\s*(km|mi)?\s*$/i, "").trim());
  if (!m) return null;
  const sec = m[2] === undefined ? 0 : Number(m[2]);
  if (sec >= 60) return null;
  const total = Number(m[1]) * 60 + sec;
  return total > 0 ? total : null;
}

/** "m:ss" / "h:mm:ss", or a bare number in `bare` units ("90" s, "10" min) → seconds. */
export function parseTime(input: string, bare: "s" | "min"): number | null {
  const s = input.trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const v = Math.round(Number(s) * (bare === "min" ? 60 : 1));
    return v > 0 ? v : null;
  }
  const v = parseDuration(s);
  return v !== null && v > 0 ? v : null;
}

/** Positive decimal ("1.5", "1,5", "0.4 km") → number in the user's units. */
export function parseDistance(input: string): number | null {
  const m = /^(\d+(?:\.\d*)?|\.\d+)\s*(km|mi|k)?$/i.exec(input.trim().replace(",", "."));
  if (!m) return null;
  const v = Number(m[1]);
  return v > 0 ? v : null;
}

/** Up to two decimals, no trailing zeros: "1", "0.4", "1.24". */
export function formatDistanceInput(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Whole-second "m:ss" of a pace per unit. */
export function formatPaceInput(secPerUnit: number): string {
  const total = Math.round(secPerUnit);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** "≈ 11.4 km · 58 min" / "≈ 20.0 km · 2 h" / "≈ 25.0 km · 2 h 30 min". */
export function estimateLabel(steps: readonly StructureStep[], units: Units): string {
  const { km, seconds } = estimateWorkout(steps);
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const time = h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
  return `≈ ${formatDistance(km, units)} · ${time}`;
}
