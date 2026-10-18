import Link from "next/link";
import { describeStep, SESSION_LABELS } from "@/lib/planning/describe";
import { isoWeekday, WEEKDAY_LABELS, type LocalDate } from "@/lib/time";
import { formatDistance, formatPace, type Units } from "@/lib/units";
import type { PlannedSession } from "@/server/dal";

const HARD = new Set(["tempo", "intervals", "race_pace", "race"]);

export function dayLabel(date: LocalDate): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAY_LABELS[isoWeekday(date)].short} ${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

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
  const accent = session.type === "long" ? "border-l-accent" : HARD.has(session.type) ? "border-l-danger" : "border-l-border";

  return (
    <details
      id={session.date}
      className={`group rounded-lg border border-border border-l-4 ${accent} bg-surface ${past ? "opacity-70" : ""} ${isToday ? "ring-2 ring-accent" : ""}`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
        <span className="w-20 shrink-0 text-xs text-muted">
          {isToday ? "Today" : dayLabel(session.date)}
        </span>
        <span className="flex-1 font-medium">
          {SESSION_LABELS[session.type]}
          {session.isUserEdited ? <span className="ml-2 text-xs font-normal text-muted">edited</span> : null}
        </span>
        <span className="text-sm tabular-nums">{session.type === "rest" ? "—" : formatDistance(session.targetKm, units)}</span>
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
        {editable && session.type !== "race" ? (
          <Link href={`/plan/sessions/${session.id}`} className="self-start font-medium text-accent">
            Edit or move →
          </Link>
        ) : null}
      </div>
    </details>
  );
}
