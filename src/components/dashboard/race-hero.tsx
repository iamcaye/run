import Link from "next/link";
import type { Phase } from "@/lib/planning/types";
import { formatDistance, formatDuration, type Units } from "@/lib/units";
import { PlanProfile, type ProfileWeek } from "./volume-profile";

type Prediction = { predictedSeconds: number; basis: string; fromKm: number };

const PHASE_SHORT: Readonly<Record<Phase, string>> = {
  base: "Base",
  build: "Build",
  specific: "Specific",
  taper: "Taper",
  race: "Race",
};

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
