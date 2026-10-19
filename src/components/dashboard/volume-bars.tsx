import { ChartFrame, shortDate } from "@/components/charts/chart-frame";
import { formatDistanceValue, toDisplayDistance, type Units } from "@/lib/units";

export type VolumeWeek = { index: number; weekStart: string; plannedKm: number; actualKm: number; isCurrent: boolean };

const BAR_PX = 144;

/** Km run per week (solid) over what was planned (track), weeks run so far; this week in red. */
export function VolumeBars({ weeks, units }: { weeks: readonly VolumeWeek[]; units: Units }) {
  const max = Math.max(...weeks.flatMap((w) => [w.plannedKm, w.actualKm]), 1);
  const px = (km: number) => Math.round((km / max) * BAR_PX);

  return (
    <ChartFrame
      title="Volume"
      subtitle={`Run vs planned, ${units} per week`}
      legend={[
        { label: "Run", swatch: "var(--foreground)" },
        { label: "Planned", swatch: "var(--track)" },
      ]}
      table={{
        columns: ["Week", "Starts", `Planned (${units})`, `Run (${units})`],
        rows: weeks.map((w) => [
          `W${w.index + 1}`,
          shortDate(w.weekStart),
          toDisplayDistance(w.plannedKm, units).toFixed(1),
          toDisplayDistance(w.actualKm, units).toFixed(1),
        ]),
      }}
    >
      <div aria-hidden className="flex flex-col gap-1.5">
        <div className="flex items-end gap-1.5 border-b-[1.5px] border-foreground" style={{ height: BAR_PX + 18 }}>
          {weeks.map((w) => (
            <div key={w.weekStart} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-[3px]">
              <span className="font-condensed text-[13px] leading-none font-bold tabular-nums">{formatDistanceValue(w.actualKm, units)}</span>
              <div className="relative w-full rounded-t-md bg-track" style={{ height: px(w.plannedKm) }}>
                <div
                  className={`absolute inset-x-0 bottom-0 rounded-t-md ${w.isCurrent ? "bg-accent" : "bg-foreground"}`}
                  style={{ height: px(w.actualKm) }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 text-center text-[11px] text-muted">
          {weeks.map((w) => (
            <span key={w.weekStart} className={`min-w-0 flex-1 ${w.isCurrent ? "font-bold text-accent" : ""}`}>
              W{w.index + 1}
            </span>
          ))}
        </div>
      </div>
    </ChartFrame>
  );
}
