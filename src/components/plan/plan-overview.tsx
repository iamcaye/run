import { PHASE_LABELS } from "@/lib/planning/describe";
import type { Phase } from "@/lib/planning/types";
import { toDisplayDistance, type Units } from "@/lib/units";
import { PHASE_BG } from "./phase";

export type WeekBar = { index: number; phase: Phase; km: number; isCurrent?: boolean };

/** Compact weekly-volume bars coloured by phase (the full charts arrive with the dashboard). */
export function PlanOverview({ weeks, units }: { weeks: readonly WeekBar[]; units: Units }) {
  const max = Math.max(1, ...weeks.map((w) => w.km));
  const phases = [...new Set(weeks.map((w) => w.phase))];
  // Training peak: race week includes the race itself, so it doesn't count.
  const peak = Math.max(0, ...weeks.filter((w) => w.phase !== "race").map((w) => w.km));

  return (
    <figure className="flex flex-col gap-2">
      <div
        className="flex h-28 items-end gap-0.5"
        role="img"
        aria-label={`${weeks.length} weeks, peaking at ${toDisplayDistance(peak, units).toFixed(0)} ${units} per week`}
      >
        {weeks.map((w) => (
          <div
            key={w.index}
            title={`Week ${w.index + 1}: ${toDisplayDistance(w.km, units).toFixed(1)} ${units}`}
            className={`min-w-0 flex-1 rounded-t-[4px] ${PHASE_BG[w.phase]} ${w.isCurrent ? "outline-2 outline-offset-2 outline-accent" : ""}`}
            style={{ height: `${Math.max(4, (w.km / max) * 100)}%` }}
          />
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {phases.map((p) => (
          <span key={p} className="flex items-center gap-1">
            <span className={`inline-block size-2.5 rounded-full ${PHASE_BG[p]}`} />
            {PHASE_LABELS[p]}
          </span>
        ))}
        <span>
          · peak {toDisplayDistance(peak, units).toFixed(0)} {units}/week
        </span>
      </figcaption>
    </figure>
  );
}
