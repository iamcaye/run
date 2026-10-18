import type { SessionType } from "@/config/training";
import { formatDistance, formatPace, type Units } from "@/lib/units";
import type { Phase, PlanWarning, StructureStep } from "./types";

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

/** Session types a user can pick when editing (the race itself is fixed). */
export const EDITABLE_SESSION_TYPES = ["easy", "long", "tempo", "intervals", "race_pace", "strides", "rest"] as const;

export function describeStep(step: StructureStep, units: Units): string {
  const at = (pace?: number) => (pace ? ` @ ${formatPace(pace, units)}` : "");
  switch (step.kind) {
    case "warmup":
      return `${formatDistance(step.km, units)} warm-up, easy`;
    case "cooldown":
      return `${formatDistance(step.km, units)} cool-down, easy`;
    case "steady":
      return `${formatDistance(step.km, units)}${at(step.paceSecPerKm)}${step.effort && !step.paceSecPerKm ? ` — ${step.effort}` : ""}`;
    case "reps": {
      const rep = step.repKm ? formatDistance(step.repKm, units, step.repKm < 1 ? 2 : 1) : `${step.repSeconds ?? 0} s`;
      const effort = step.effort && !step.paceSecPerKm ? ` — ${step.effort}` : "";
      return `${step.reps} × ${rep}${at(step.paceSecPerKm)}, ${step.recoverySeconds} s easy between${effort}`;
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
