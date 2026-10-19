import Link from "next/link";
import { describeStep, QUALITY_TYPES, SESSION_LABELS } from "@/lib/planning/describe";
import { isoWeekday, WEEKDAY_LABELS, type LocalDate } from "@/lib/time";
import { formatDistance, formatDistanceValue, formatPace, type Units } from "@/lib/units";
import type { PlannedSession } from "@/server/dal";
import { StructureBar } from "./structure-bar";

export function dayLabel(date: LocalDate): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAY_LABELS[isoWeekday(date)].short} ${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

const KIND = (type: PlannedSession["type"]) =>
  QUALITY_TYPES.has(type) ? { label: "Quality", className: "text-accent" } : type === "long" ? { label: "Long", className: "text-foreground" } : null;

export function SessionCard({
  session,
  units,
  today,
  editable = true,
}: {
  session: PlannedSession;
  units: Units;
  today: LocalDate;
  editable?: boolean;
}) {
  const isToday = session.date === today;
  const past = session.date < today;
  const rest = session.type === "rest";
  const kind = KIND(session.type);
  const d = new Date(`${session.date}T00:00:00Z`);

  return (
    <details
      id={session.date}
      className={`group rounded-2xl bg-surface ${past ? "opacity-70" : ""} ${isToday ? "ring-2 ring-accent" : ""}`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
        <span className={`flex w-10 shrink-0 flex-col items-center leading-none ${isToday ? "text-accent" : ""}`}>
          <span className="text-[11px] font-bold tracking-wide uppercase">{isToday ? "Today" : WEEKDAY_LABELS[isoWeekday(session.date)].short}</span>
          <span className="font-condensed text-2xl font-bold tabular-nums">{d.getUTCDate()}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={`font-semibold ${rest ? "text-muted" : ""}`}>
            {SESSION_LABELS[session.type]}
            {kind ? <span className={`ml-2 text-[11px] font-bold tracking-wider uppercase ${kind.className}`}>{kind.label}</span> : null}
            {session.isUserEdited ? <span className="ml-2 text-xs font-normal text-muted">edited</span> : null}
          </span>
          {session.structure?.steps.length ? <StructureBar steps={session.structure.steps} units={units} size="sm" /> : null}
        </span>
        <span className="font-condensed text-xl font-bold tabular-nums">
          {rest ? (
            <span className="text-muted">—</span>
          ) : (
            <>
              {formatDistanceValue(session.targetKm, units)}
              <span className="text-sm text-muted"> {units}</span>
            </>
          )}
        </span>
        <span aria-hidden className="text-muted transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-border px-3 py-3 text-sm">
        {session.targetPaceSecPerKm ? (
          <p>
            Target pace <strong className="tabular-nums">{formatPace(session.targetPaceSecPerKm, units)}</strong>
          </p>
        ) : null}
        {session.effortDescription ? <p className="text-muted">{session.effortDescription}</p> : null}
        {session.structure?.steps.length ? (
          <ol className="list-decimal pl-5">
            {session.structure.steps.map((step, i) => (
              <li key={i}>{describeStep(step, units)}</li>
            ))}
          </ol>
        ) : null}
        {!rest ? <p className="text-muted">{dayLabel(session.date)} · {formatDistance(session.targetKm, units)}</p> : null}
        {editable && session.type !== "race" ? (
          <Link href={`/plan/sessions/${session.id}`} className="self-start font-semibold text-accent">
            Edit or move →
          </Link>
        ) : null}
      </div>
    </details>
  );
}
