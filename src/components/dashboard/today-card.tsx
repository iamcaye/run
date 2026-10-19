import Link from "next/link";
import { describeStep, SESSION_LABELS } from "@/lib/planning/describe";
import type { StructureStep } from "@/lib/planning/types";
import { isoWeekday, WEEKDAY_LABELS, type LocalDate } from "@/lib/time";
import { formatDistance, formatDistanceValue, formatPace, type Units } from "@/lib/units";
import type { DashboardSession } from "@/services/dashboard";
import { dayLabel } from "@/components/plan/session-card";

type Segment = { weight: number; work: boolean };

// Rough distance equivalents so time-based reps and recoveries get a sensible width.
const REP_SEC_PER_KM = 240;
const RECOVERY_SEC_PER_KM = 360;

/** Session steps as proportional blocks: easy parts low, work parts tall. */
export function structureSegments(steps: readonly StructureStep[]): Segment[] {
  const out: Segment[] = [];
  for (const step of steps) {
    switch (step.kind) {
      case "warmup":
      case "cooldown":
        out.push({ weight: step.km, work: false });
        break;
      case "steady":
        out.push({ weight: step.km, work: true });
        break;
      case "reps": {
        const rep = step.repKm ?? (step.repSeconds ?? 0) / REP_SEC_PER_KM;
        for (let i = 0; i < step.reps; i++) {
          out.push({ weight: rep, work: true });
          if (i < step.reps - 1) out.push({ weight: step.recoverySeconds / RECOVERY_SEC_PER_KM, work: false });
        }
        break;
      }
    }
  }
  return out.filter((s) => s.weight > 0);
}

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
  const segments = structureSegments(steps);
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
      {segments.length > 1 ? (
        <div role="img" aria-label={`Session structure: ${steps.map((s) => describeStep(s, units)).join("; ")}`} className="flex h-9 items-end gap-[3px]">
          {segments.map((s, i) => (
            <div
              key={i}
              className={`min-w-[3px] rounded ${s.work ? "h-9 bg-accent" : "h-3 bg-track"}`}
              style={{ flexGrow: s.weight, flexBasis: 0 }}
            />
          ))}
        </div>
      ) : null}
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
