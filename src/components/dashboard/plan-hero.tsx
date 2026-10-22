import Link from "next/link";
import { formatRaceDate } from "@/components/goals/goal-summary";
import type { LocalDate } from "@/lib/time";
import type { Units } from "@/lib/units";
import { PlanProfile, type ProfileWeek } from "./volume-profile";

type HeroPlan = { name: string; finished: boolean };

function Headline({
  plan,
  weekNumber,
  totalWeeks,
  startDate,
}: {
  plan: HeroPlan;
  weekNumber: number | null;
  totalWeeks: number | null;
  startDate: LocalDate | null;
}) {
  if (plan.finished) {
    return <span className="font-condensed text-6xl leading-[0.85] font-extrabold italic uppercase">Plan finished</span>;
  }
  if (weekNumber === null || totalWeeks === null) {
    return (
      <span className="flex flex-col gap-1">
        <span className="font-condensed text-6xl leading-[0.85] font-extrabold italic uppercase">Starts soon</span>
        {startDate ? <span className="text-sm font-semibold">First session {formatRaceDate(startDate)}</span> : null}
      </span>
    );
  }
  return (
    <span className="flex items-end gap-2.5">
      <span className="pb-1 font-condensed text-3xl leading-none font-extrabold italic uppercase">Week</span>
      <span className="font-condensed text-[104px] leading-[0.8] font-extrabold tracking-tight italic tabular-nums">{weekNumber}</span>
      <span className="pb-1 font-condensed text-3xl leading-none font-extrabold italic uppercase tabular-nums">of {totalWeeks}</span>
    </span>
  );
}

/** The dashboard hero while a custom plan is active: where you are in the plan, over its weekly volume profile. */
export function PlanHero({
  plan,
  weekNumber,
  totalWeeks,
  volume,
  units,
  startDate = null,
}: {
  plan: HeroPlan;
  weekNumber: number | null;
  totalWeeks: number | null;
  volume: readonly ProfileWeek[];
  units: Units;
  /** First session date, shown before the plan starts. */
  startDate?: LocalDate | null;
}) {
  return (
    <section
      aria-labelledby="plan-title"
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
        <h1 id="plan-title" className="truncate">
          {plan.name}
        </h1>
        {totalWeeks ? (
          <span className="shrink-0 tabular-nums">
            {totalWeeks} {totalWeeks === 1 ? "week" : "weeks"}
          </span>
        ) : null}
      </div>
      <div className="relative">
        <Headline plan={plan} weekNumber={weekNumber} totalWeeks={totalWeeks} startDate={startDate} />
      </div>
      <PlanProfile weeks={volume} units={units} markerWeek={weekNumber} />
      {plan.finished ? (
        <nav aria-label="What next" className="relative flex flex-wrap items-center gap-2">
          <Link
            href="/plans"
            className="rounded-[14px] bg-hero-foreground px-4 py-2.5 font-condensed text-lg font-bold tracking-wider text-hero uppercase"
          >
            My plans
          </Link>
          <Link
            href="/goals"
            className="rounded-[14px] border-2 border-hero-foreground px-4 py-2 font-condensed text-lg font-bold tracking-wider uppercase"
          >
            Goals
          </Link>
        </nav>
      ) : (
        <Link href="/plans" className="relative self-end text-xs font-semibold underline-offset-2 hover:underline">
          My plans →
        </Link>
      )}
    </section>
  );
}
