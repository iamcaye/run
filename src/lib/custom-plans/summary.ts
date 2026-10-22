import { estimateWorkout } from "@/lib/custom-plans/estimate";
import type { PlanWorkout } from "@/lib/custom-plans/types";
import type { StepTarget, StructureStep } from "@/lib/planning/types";
import { formatDistance, formatPace, type Units } from "@/lib/units";

function targetLabel(t: StepTarget, units: Units): string {
  if (t.kind === "pace") return formatPace(t.secPerKm, units);
  if (t.kind === "hr_zone") return `Z${t.zone}`;
  return `RPE ${t.rpe}`;
}

/** The target of the main (work) block: the first repeat, else the first steady block. */
function mainTarget(steps: readonly StructureStep[], units: Units): string | null {
  const main = steps.find((s) => s.kind === "reps") ?? steps.find((s) => s.kind === "steady");
  if (!main) return null;
  if (main.target) return targetLabel(main.target, units);
  return main.paceSecPerKm ? formatPace(main.paceSecPerKm, units) : null;
}

/** "≈ 12 km · 4:30/km" line of a workout. */
export function workoutSummary(w: PlanWorkout, units: Units): string {
  const km = `≈ ${formatDistance(estimateWorkout(w.steps).km, units)}`;
  const target = mainTarget(w.steps, units);
  return target ? `${km} · ${target}` : km;
}
