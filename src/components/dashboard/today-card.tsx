import Link from "next/link";
import { describeStep, SESSION_LABELS } from "@/lib/planning/describe";
import { isoWeekday, WEEKDAY_LABELS, type LocalDate } from "@/lib/time";
import { formatDistance, formatDistanceValue, formatPace, type Units } from "@/lib/units";
import type { DashboardSession } from "@/services/dashboard";
import { dayLabel } from "@/components/plan/session-card";
import { StructureBar } from "@/components/plan/structure-bar";

const eyebrow = "flex items-center justify-between gap-2 text-xs font-bold tracking-widest uppercase";
const weekday = (date: LocalDate) => WEEKDAY_LABELS[isoWeekday(date)].short;

export function TodayCard({
  session,
  next,
  today,
  units,
}: {
  session: DashboardSession | null;
  next: DashboardSession | null;
  today: LocalDate;
  units: Units;
}) {
  if (!session || session.type === "rest") {
    return (
      <section aria-label="Today" className="flex flex-col gap-2 rounded-[22px] bg-surface px-5 py-4">
        <div className={eyebrow}>
          <span className="text-accent">● Today · {weekday(today)}</span>
        </div>
        <h2 className="font-condensed text-[40px] leading-none font-extrabold uppercase">Rest day</h2>
        {next ? (
          <p className="text-[15px] text-muted">
            Next: <strong className="text-foreground">{dayLabel(next.date)}</strong> · {SESSION_LABELS[next.type]}{" "}
            {formatDistance(next.targetKm, units)}
          </p>
        ) : null}
      </section>
    );
  }

  const steps = session.structure?.steps ?? [];
  const done = session.status === "done";

  return (
    <section aria-label="Today's session" className="flex flex-col gap-2.5 rounded-[22px] bg-surface px-5 py-4">
      <div className={eyebrow}>
        <span className="text-accent">● Today · {weekday(today)}</span>
        {session.targetPaceSecPerKm ? <span className="text-muted tabular-nums">{formatPace(session.targetPaceSecPerKm, units)}</span> : null}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-condensed text-[40px] leading-none font-extrabold uppercase">{SESSION_LABELS[session.type]}</h2>
        <span className="shrink-0 font-condensed text-[30px] font-bold tabular-nums">
          {formatDistanceValue(session.targetKm, units)}
          <span className="text-base text-muted"> {units}</span>
        </span>
      </div>
      <StructureBar steps={steps} units={units} />
      {steps.length ? (
        <ol className="flex flex-wrap gap-x-1.5 text-sm text-muted">
          {steps.map((s, i) => (
            <li key={i}>
              {i > 0 ? <span aria-hidden>· </span> : null}
              {describeStep(s, units)}
            </li>
          ))}
        </ol>
      ) : session.effortDescription ? (
        <p className="text-[15px] text-muted">{session.effortDescription}</p>
      ) : null}
      {done ? (
        <Link
          href="/activities"
          className="mt-1 flex h-[50px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-foreground font-condensed text-[19px] font-bold tracking-wider uppercase"
        >
          ✓ Done · {session.actualKm !== null ? formatDistance(session.actualKm, units) : ""} <span aria-hidden>→</span>
        </Link>
      ) : (
        <Link
          href="/log"
          className="mt-1 flex h-[50px] items-center justify-center gap-2 rounded-[14px] bg-foreground font-condensed text-[19px] font-bold tracking-wider text-background uppercase transition-transform active:scale-[0.98]"
        >
          Log this run <span aria-hidden>→</span>
        </Link>
      )}
    </section>
  );
}
