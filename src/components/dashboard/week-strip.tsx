import Link from "next/link";
import type { SessionType } from "@/config/training";
import type { SessionStatus } from "@/lib/metrics";
import { SESSION_LABELS } from "@/lib/planning/describe";
import { isoWeekday, WEEKDAY_LABELS, type LocalDate } from "@/lib/time";
import { formatDistanceValue, type Units } from "@/lib/units";
import type { DashboardSession } from "@/services/dashboard";
import { dayLabel } from "@/components/plan/session-card";

const SHORT: Readonly<Record<SessionType, string>> = {
  easy: "Easy",
  long: "Long",
  tempo: "Tempo",
  intervals: "Int",
  race_pace: "Pace",
  strides: "Strides",
  race: "Race",
  rest: "Rest",
};

const STATUS_WORD: Readonly<Record<SessionStatus, string>> = {
  done: "done",
  missed: "missed",
  today: "today",
  upcoming: "upcoming",
  rest: "rest",
};

const CHIP: Readonly<Record<SessionStatus, string>> = {
  done: "bg-foreground text-background",
  today: "bg-surface ring-2 ring-inset ring-accent",
  upcoming: "bg-background",
  missed: "bg-background text-status-critical line-through decoration-2",
  rest: "text-muted ring-[1.5px] ring-inset ring-border",
};

/** The seven days of this week as chips; each opens that day in the plan. */
export function WeekStrip({ days, units }: { days: readonly { date: LocalDate; session: DashboardSession | null }[]; units: Units }) {
  return (
    <ol className="grid grid-cols-7 gap-1.5">
      {days.map(({ date, session }) => {
        const status: SessionStatus = session?.status ?? "rest";
        const isRest = !session || session.type === "rest";
        const value = isRest ? "–" : formatDistanceValue(session.actualKm ?? session.targetKm, units);
        const type = session ? SHORT[session.type] : "Rest";
        const label = `${dayLabel(date)}: ${session ? SESSION_LABELS[session.type] : "Rest"}${isRest ? "" : `, ${value} ${units}`}, ${STATUS_WORD[status]}`;
        return (
          <li key={date}>
            <Link
              href={`/plan#${date}`}
              aria-label={label}
              className={`flex flex-col items-center gap-1 rounded-xl py-2 transition-transform active:scale-95 ${CHIP[status]}`}
            >
              <span className="text-[11px] font-bold tracking-wide uppercase">{WEEKDAY_LABELS[isoWeekday(date)].short}</span>
              <span className="font-condensed text-xl leading-none font-bold tabular-nums">{value}</span>
              <span className="text-[10px] font-semibold uppercase">
                {type}
                {status === "done" ? " ✓" : ""}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
