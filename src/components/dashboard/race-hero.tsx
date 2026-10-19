import Link from "next/link";
import type { Phase } from "@/lib/planning/types";
import { formatDistance, formatDuration, toDisplayDistance, type Units } from "@/lib/units";

export type ProfileWeek = { plannedKm: number; phase: Phase | null; isCurrent: boolean; isFuture: boolean };

type Prediction = { predictedSeconds: number; basis: string; fromKm: number };

const PHASE_SHORT: Readonly<Record<Phase, string>> = {
  base: "Base",
  build: "Build",
  specific: "Specific",
  taper: "Taper",
  race: "Race",
};

// Profile plot (viewBox units = px tall); TOP keeps the peak off the label strip above.
const W = 320;
const H = 120;
const TOP = 12;
const LABEL_STRIP = 24;

function Countdown({ daysToRace }: { daysToRace: number | null }) {
  if (daysToRace === null) return <span />;
  if (daysToRace <= 0) {
    return (
      <span className="font-condensed text-6xl leading-[0.85] font-extrabold italic uppercase">
        {daysToRace === 0 ? "Race day!" : "Race done"}
      </span>
    );
  }
  return (
    <span className="flex items-end gap-2.5">
      <span
        className={`font-condensed leading-[0.8] font-extrabold tracking-tight italic tabular-nums ${daysToRace >= 100 ? "text-[84px]" : "text-[104px]"}`}
      >
        {daysToRace}
      </span>
      <span className="pb-0.5 font-condensed text-xl leading-[0.95] font-bold uppercase">
        {daysToRace === 1 ? "Day" : "Days"}
        <br />
        to go
      </span>
    </span>
  );
}

function PredictionBlock({
  prediction,
  targetSeconds,
  goalKm,
  units,
}: {
  prediction: Prediction | null;
  targetSeconds: number | null;
  goalKm: number;
  units: Units;
}) {
  const label = <span className="text-[11px] font-bold tracking-widest uppercase opacity-90">Predicted</span>;
  if (!prediction) {
    return (
      <div className="flex max-w-36 flex-col items-end gap-1 text-right">
        {label}
        <span className="font-condensed text-[34px] leading-[0.9] font-bold">—</span>
        <span className="text-xs">Needs a run of {formatDistance(Math.max(3, goalKm * 0.25), units, 0)}+ in the last 6 weeks</span>
      </div>
    );
  }
  const diff = targetSeconds ? prediction.predictedSeconds - targetSeconds : null;
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      {label}
      <span className="font-condensed text-[34px] leading-[0.9] font-bold tabular-nums">
        {formatDuration(prediction.predictedSeconds)}
      </span>
      <span className="rounded-md bg-hero-foreground px-2 py-0.5 text-xs font-bold whitespace-nowrap text-hero tabular-nums">
        {diff !== null && targetSeconds
          ? `${diff <= 0 ? "▼" : "▲"} ${formatDuration(Math.abs(diff))} vs ${formatDuration(targetSeconds)}`
          : `from a ${formatDistance(prediction.fromKm, units)} run`}
      </span>
      {prediction.basis === "any" ? <span className="max-w-40 text-[11px] leading-tight opacity-90">From an easy run — likely conservative</span> : null}
    </div>
  );
}

/**
 * The plan drawn as a course profile: weekly planned km, done part solid, marker on this week.
 * The area stretches to any width; labels and the marker are HTML so they keep their size.
 */
function PlanProfile({ weeks, units }: { weeks: readonly ProfileWeek[]; units: Units }) {
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
  const currentKm = current >= 0 ? Math.round(toDisplayDistance(weeks[current]!.plannedKm, units)) : null;
  const description =
    `Plan profile: ${units} per week over ${n} weeks, peaking at ${peakKm} ${units} in week ${peak + 1}` +
    (current >= 0 ? `; this is week ${current + 1} (${currentKm} ${units} planned)` : "");

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
            WK {current + 1}
          </span>
        </>
      ) : null}
    </div>
  );
}

/** Consecutive weeks of the same phase as one segment; the current one highlighted. */
function PhaseBar({ weeks, weekNumber, totalWeeks }: { weeks: readonly ProfileWeek[]; weekNumber: number | null; totalWeeks: number | null }) {
  const segments: { phase: Phase | null; weeks: number; current: boolean }[] = [];
  for (const w of weeks) {
    const last = segments.at(-1);
    if (last && last.phase === w.phase) {
      last.weeks++;
      last.current ||= w.isCurrent;
    } else segments.push({ phase: w.phase, weeks: 1, current: w.isCurrent });
  }
  if (segments.length === 0) return null;
  return (
    <div aria-hidden className="relative flex gap-[3px]">
      {segments.map((s, i) => (
        <div key={i} className="flex min-w-0 flex-col gap-1" style={{ flexGrow: s.weeks, flexBasis: 0 }}>
          <div className={`h-[5px] rounded-full bg-hero-foreground ${s.current ? "" : "opacity-45"}`} />
          <span className={`truncate text-[10px] tracking-widest uppercase ${s.current ? "font-extrabold" : "font-semibold opacity-85"}`}>
            {s.phase ? PHASE_SHORT[s.phase] : ""}
            {s.current && weekNumber && totalWeeks ? ` · wk ${weekNumber}/${totalWeeks}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RaceHero({
  name,
  distanceKm,
  units,
  daysToRace,
  prediction,
  targetSeconds,
  weeks,
  weekNumber,
  totalWeeks,
}: {
  name: string;
  distanceKm: number;
  units: Units;
  daysToRace: number | null;
  prediction: Prediction | null;
  targetSeconds: number | null;
  weeks: readonly ProfileWeek[];
  weekNumber: number | null;
  totalWeeks: number | null;
}) {
  return (
    <section
      aria-labelledby="goal-title"
      className="relative flex flex-col gap-3 overflow-hidden rounded-[22px] bg-hero p-5 text-hero-foreground"
    >
      {/* Track lanes. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-radial-gradient(circle at 115% -10%, transparent 0 26px, rgb(255 255 255 / 0.12) 26px 28px)",
        }}
      />
      <div className="relative flex items-center justify-between gap-3 text-[13px] font-semibold tracking-wider uppercase">
        <h1 id="goal-title" className="truncate">
          {name}
        </h1>
        <span className="shrink-0 tabular-nums">{formatDistance(distanceKm, units)}</span>
      </div>
      <div className="relative flex items-end justify-between gap-3">
        <Countdown daysToRace={daysToRace} />
        <PredictionBlock prediction={prediction} targetSeconds={targetSeconds} goalKm={distanceKm} units={units} />
      </div>
      <PlanProfile weeks={weeks} units={units} />
      <PhaseBar weeks={weeks} weekNumber={weekNumber} totalWeeks={totalWeeks} />
      <Link href="/goals" className="relative self-end text-xs font-semibold underline-offset-2 hover:underline">
        All goals →
      </Link>
    </section>
  );
}
