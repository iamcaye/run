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

// Profile drawing area (viewBox units); TOP leaves room for the labels above the peak.
const W = 320;
const H = 120;
const TOP = 22;
const LABEL_W = 44;

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

/** The plan drawn as a course profile: weekly planned km, done part solid, marker on this week. */
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

  const markerX = current >= 0 ? pts[current]![0] : 0;
  const labelX = Math.min(Math.max(markerX > W / 2 ? markerX - LABEL_W - 6 : markerX + 6, 0), W - LABEL_W);

  return (
    <svg role="img" aria-label={description} viewBox={`0 -10 ${W} ${H + 10}`} className="relative mt-1 block w-full overflow-visible">
      {split >= 0 ? <path d={`M0,${H} ${line(0, split)} L${splitX.toFixed(1)},${H} Z`} fill="currentColor" /> : null}
      {split < n - 1 ? (
        <>
          <path
            d={`M${splitX.toFixed(1)},${H} ${line(Math.max(split, 0), n - 1)} L${W},${H} Z`}
            fill="currentColor"
            fillOpacity={0.22}
          />
          <path
            d={`M${line(Math.max(split, 0), n - 1).slice(1)}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        </>
      ) : null}
      <line x1={0} y1={H} x2={W} y2={H} stroke="currentColor" strokeWidth={1.5} />
      {peak !== current && Math.abs(peak - current) > 2 ? (
        <text
          x={Math.min(Math.max(pts[peak]![0], 20), W - 20)}
          y={pts[peak]![1] - 7}
          textAnchor="middle"
          fill="currentColor"
          className="font-condensed text-[13px] font-bold uppercase"
        >
          {peakKm} {units}
        </text>
      ) : null}
      {current >= 0 ? (
        <g>
          <line x1={markerX} y1={0} x2={markerX} y2={H} stroke="#1a1714" strokeWidth={2} />
          <circle cx={markerX} cy={pts[current]![1]} r={7} fill="#1a1714" stroke="#ffffff" strokeWidth={3} />
          <rect x={labelX} y={-8} width={LABEL_W} height={20} rx={6} fill="#1a1714" />
          <text x={labelX + LABEL_W / 2} y={6} textAnchor="middle" fill="#ffffff" className="font-condensed text-[13px] font-bold">
            WK {current + 1}
          </text>
        </g>
      ) : null}
    </svg>
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
