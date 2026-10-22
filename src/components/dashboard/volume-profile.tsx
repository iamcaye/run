import type { Phase } from "@/lib/planning/types";
import { toDisplayDistance, type Units } from "@/lib/units";

export type ProfileWeek = { plannedKm: number; phase: Phase | null; isCurrent: boolean; isFuture: boolean };

// Profile plot (viewBox units = px tall); TOP keeps the peak off the label strip above.
const W = 320;
const H = 120;
const TOP = 12;
const LABEL_STRIP = 24;

/**
 * The plan drawn as a course profile: weekly planned km, done part solid, marker on this week.
 * The area stretches to any width; labels and the marker are HTML so they keep their size.
 * `markerWeek` overrides the marker's week number (a custom plan numbers its own weeks).
 */
export function PlanProfile({ weeks, units, markerWeek }: { weeks: readonly ProfileWeek[]; units: Units; markerWeek?: number | null }) {
  const n = weeks.length;
  if (n < 2) return null;
  const max = Math.max(...weeks.map((w) => w.plannedKm), 1);
  const pts = weeks.map((w, i) => [(i * W) / (n - 1), H - (w.plannedKm / max) * (H - TOP)] as const);
  const line = (from: number, to: number) => pts.slice(from, to + 1).map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  const split = weeks.findLastIndex((w) => !w.isFuture);
  const current = weeks.findIndex((w) => w.isCurrent);
  const peak = weeks.findIndex((w) => w.plannedKm === max);
  const splitX = split >= 0 ? pts[split]![0] : 0;

  const peakKm = Math.round(toDisplayDistance(max, units));
  const currentWeek = markerWeek ?? current + 1;
  const currentKm = current >= 0 ? Math.round(toDisplayDistance(weeks[current]!.plannedKm, units)) : null;
  const description =
    `Plan profile: ${units} per week over ${n} weeks, peaking at ${peakKm} ${units} in week ${peak + 1}` +
    (current >= 0 ? `; this is week ${currentWeek} (${currentKm} ${units} planned)` : "");

  // viewBox units map 1:1 to px vertically; the label strip sits above the plot.
  const pct = (x: number) => (x / W) * 100;
  const top = (y: number) => LABEL_STRIP + y;
  const markerPct = current >= 0 ? pct(pts[current]![0]) : 0;
  const peakPct = pct(pts[peak]![0]);

  return (
    <div role="img" aria-label={description} className="relative mt-1" style={{ height: LABEL_STRIP + H }}>
      <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 block w-full" style={{ height: H }}>
        {split >= 0 ? <path d={`M0,${H} ${line(0, split)} L${splitX.toFixed(1)},${H} Z`} fill="currentColor" /> : null}
        {split < n - 1 ? (
          <>
            <path d={`M${splitX.toFixed(1)},${H} ${line(Math.max(split, 0), n - 1)} L${W},${H} Z`} fill="currentColor" fillOpacity={0.22} />
            <path
              d={`M${line(Math.max(split, 0), n - 1).slice(1)}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
        <line x1={0} y1={H} x2={W} y2={H} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      {Math.abs(peak - current) > 2 ? (
        <span
          aria-hidden
          className="absolute font-condensed text-[13px] leading-none font-bold whitespace-nowrap uppercase"
          style={{
            left: `${peakPct}%`,
            top: top(pts[peak]![1]) - 18,
            transform: `translateX(${peakPct < 8 ? "0" : peakPct > 92 ? "-100%" : "-50%"})`,
          }}
        >
          {peakKm} {units}
        </span>
      ) : null}
      {current >= 0 ? (
        <>
          <span aria-hidden className="absolute bottom-0 w-0.5 -translate-x-1/2 bg-[#1a1714]" style={{ left: `${markerPct}%`, top: 4 }} />
          <span
            aria-hidden
            className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-[#1a1714] box-content"
            style={{ left: `${markerPct}%`, top: top(pts[current]![1]) }}
          />
          <span
            aria-hidden
            className="absolute top-0 rounded-md bg-[#1a1714] px-2 py-0.5 font-condensed text-[13px] font-bold whitespace-nowrap text-white"
            style={markerPct > 50 ? { right: `calc(${100 - markerPct}% + 6px)` } : { left: `calc(${markerPct}% + 6px)` }}
          >
            WK {currentWeek}
          </span>
        </>
      ) : null}
    </div>
  );
}
