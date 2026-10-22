import type { SessionType } from "@/config/training";
import { formatDistance, formatDuration, formatPace, type Units } from "@/lib/units";
import type { Phase, PlanWarning, StepTarget, StructureStep } from "./types";

export const SESSION_LABELS: Readonly<Record<SessionType, string>> = {
  easy: "Easy",
  long: "Long run",
  tempo: "Tempo",
  intervals: "Intervals",
  race_pace: "Race pace",
  strides: "Easy + strides",
  race: "Race",
  rest: "Rest",
};

export const PHASE_LABELS: Readonly<Record<Phase, string>> = {
  base: "Base",
  build: "Build",
  specific: "Race-specific",
  taper: "Taper",
  race: "Race week",
};

/** Hard sessions: shown as "Quality" in the plan UI. */
export const QUALITY_TYPES: ReadonlySet<string> = new Set(["tempo", "intervals", "race_pace", "race"]);

/** Session types a user can pick when editing (the race itself is fixed). */
export const EDITABLE_SESSION_TYPES = ["easy", "long", "tempo", "intervals", "race_pace", "strides", "rest"] as const;

/** "10 min" for whole minutes under an hour, otherwise "m:ss" / "h:mm:ss". */
function blockDuration(seconds: number): string {
  if (seconds < 3600 && seconds % 60 === 0) return `${seconds / 60} min`;
  return formatDuration(seconds);
}

/** Per-rep duration: "20 s" under a minute (generated strides), else "1:00". */
function repDuration(seconds: number): string {
  return seconds < 60 ? `${seconds} s` : formatDuration(seconds);
}

function targetText(target: StepTarget, units: Units): string {
  switch (target.kind) {
    case "pace":
      return formatPace(target.secPerKm, units).replace(" /", "/");
    case "hr_zone":
      return `Z${target.zone}`;
    case "rpe":
      return `RPE ${target.rpe}`;
  }
}

function recoveryText(step: Extract<StructureStep, { kind: "reps" }>, units: Units): string {
  const label = step.recoveryKind ?? "easy";
  if (step.recoveryKm !== undefined) return `${formatDistance(step.recoveryKm, units)} ${label} between`;
  const secs = step.recoverySeconds ?? 0;
  return `${step.recoveryKind ? formatDuration(secs) : `${secs} s`} ${label} between`;
}

export function describeStep(step: StructureStep, units: Units): string {
  const at = (pace?: number) => (pace ? ` @ ${formatPace(pace, units)}` : "");
  const atStep = (s: { target?: StepTarget; paceSecPerKm?: number }) =>
    s.target ? ` @ ${targetText(s.target, units)}` : at(s.paceSecPerKm);
  const size = (s: { km?: number; seconds?: number }) =>
    s.km !== undefined ? formatDistance(s.km, units) : blockDuration(s.seconds ?? 0);
  switch (step.kind) {
    case "warmup":
      return `${size(step)} warm-up, easy${step.target ? ` @ ${targetText(step.target, units)}` : ""}`;
    case "cooldown":
      return `${size(step)} cool-down, easy${step.target ? ` @ ${targetText(step.target, units)}` : ""}`;
    case "steady":
      return `${size(step)}${atStep(step)}${step.effort && !step.paceSecPerKm && !step.target ? ` — ${step.effort}` : ""}`;
    case "reps": {
      const rep = step.repKm ? formatDistance(step.repKm, units, step.repKm < 1 ? 2 : 1) : repDuration(step.repSeconds ?? 0);
      const effort = step.effort && !step.paceSecPerKm && !step.target ? ` — ${step.effort}` : "";
      return `${step.reps} × ${rep}${atStep(step)}, ${recoveryText(step, units)}${effort}`;
    }
  }
}

export function describeWarning(w: PlanWarning): string {
  switch (w.code) {
    case "compressed":
      return `Only ${w.weeks} week${w.weeks === 1 ? "" : "s"} until race day (${w.recommendedWeeks}+ recommended). The plan is compressed: less base building, same taper.`;
    case "race_not_in_future":
      return "Race day isn't in the future, so there's nothing to plan.";
    case "peak_clamped":
      return `From your current volume the plan peaks at ${w.peakKm} km/week (typical: ${w.tablePeakKm}) to keep increases within 10% a week.`;
    case "paces_estimated":
      return `Paces are estimated from a recent ${w.fromKm.toFixed(1)} km run. Add a target time for precise paces.`;
    case "no_paces":
      return "No target time or recent runs yet, so sessions are guided by effort (RPE) instead of paces.";
    case "quality_dropped":
      return `Week ${w.weekIndex + 1}: not enough well-spaced days for every quality session, so one was left out.`;
    case "long_run_moved":
      return `Week ${w.weekIndex + 1}: the long run isn't on your usual day.`;
  }
}

/** Collapses per-week warnings into one line each for display. */
export function summarizeWarnings(warnings: readonly PlanWarning[]): string[] {
  const dropped = warnings.filter((w) => w.code === "quality_dropped").length;
  const moved = warnings.filter((w) => w.code === "long_run_moved").length;
  const lines = warnings.filter((w) => w.code !== "quality_dropped" && w.code !== "long_run_moved").map(describeWarning);
  if (dropped > 0) {
    lines.push(
      `${dropped} week${dropped === 1 ? "" : "s"} have fewer quality sessions than ideal: your run days don't leave enough spacing around the long run. More run days (or a different long-run day) would help.`,
    );
  }
  if (moved > 0) lines.push(`In ${moved} week${moved === 1 ? "" : "s"} the long run moves off your usual day.`);
  return lines;
}
