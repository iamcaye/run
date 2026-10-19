import Link from "next/link";
import { PHASE_BG } from "@/components/plan/phase";
import { dayLabel } from "@/components/plan/session-card";
import { StructureBar } from "@/components/plan/structure-bar";
import { PHASE_LABELS, SESSION_LABELS } from "@/lib/planning/describe";
import type { Phase } from "@/lib/planning/types";
import type { CalendarDay, CalendarWeek, MonthGrid } from "@/lib/plan-calendar";
import { isoWeekday, WEEKDAY_LABELS } from "@/lib/time";
import { formatDistanceValue, toDisplayDistance, type Units } from "@/lib/units";

/** Static class names so Tailwind can see them. */
const PHASE_BORDER: Readonly<Record<Phase, string>> = {
  base: "border-l-phase-base",
  build: "border-l-phase-build",
  specific: "border-l-phase-specific",
  taper: "border-l-phase-taper",
  race: "border-l-phase-race",
};

const NAV_BTN = "rounded-lg border border-border bg-surface px-2.5 py-0.5 text-sm font-bold";

function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function NavLink({ month, label, aria }: { month: string | null; label: string; aria: string }) {
  if (!month)
    return (
      <span aria-label={aria} aria-disabled="true" className={`${NAV_BTN} opacity-40`}>
        {label}
      </span>
    );
  return (
    <Link href={`/plan?month=${month}`} aria-label={aria} className={NAV_BTN}>
      {label}
    </Link>
  );
}

function DayCell({ day, units }: { day: CalendarDay; units: Units }) {
  const restOnly = day.sessions.length > 0 && day.sessions.every((s) => s.type === "rest");
  const classes = [
    "flex min-h-20 flex-col gap-1 rounded-xl border border-border p-1.5",
    day.isRace ? "bg-hero text-hero-foreground" : restOnly ? "bg-transparent" : "bg-surface",
    !day.inMonth ? "opacity-40" : day.isPast ? "opacity-75" : "",
    day.isToday ? "ring-2 ring-accent" : "",
    day.emphasis === "quality"
      ? "border-l-4 border-l-accent"
      : day.emphasis === "long"
        ? "border-l-4 border-l-foreground"
        : "",
  ].join(" ");
  const number = Number(day.date.slice(8));

  return (
    <div className={classes}>
      <span className={`text-xs font-bold ${day.isToday ? "text-accent" : day.isRace ? "" : "text-muted"}`}>
        {number}
        {day.isToday ? " · Today" : ""}
      </span>
      {day.sessions.map((s) => {
        if (s.type === "rest") {
          return (
            <Link key={s.id} href={`/plan/sessions/${s.id}`} className="text-xs text-muted">
              Rest<span className="sr-only"> on {dayLabel(day.date)}</span>
            </Link>
          );
        }
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-1">
              <span className="text-xs font-bold">{SESSION_LABELS[s.type]}</span>
              {s.status === "done" || s.status === "missed" ? (
                <span className={`font-black ${s.status === "done" ? "text-status-good" : "text-status-warning"}`}>
                  <span aria-hidden>{s.status === "done" ? "✓" : "!"}</span>
                  <span className="sr-only">{s.status}</span>
                </span>
              ) : null}
            </span>
            {s.structure?.steps.length ? <StructureBar steps={s.structure.steps} units={units} size="sm" /> : null}
            <span className="font-condensed text-base leading-none font-bold">
              {formatDistanceValue(s.targetKm, units)}{" "}
              <small className="text-[10px] font-semibold opacity-70">{units}</small>
            </span>
            <span className="sr-only">{dayLabel(day.date)}</span>
          </>
        );
        // Race day has no edit page (it 404s), so it stays a plain block.
        return s.type === "race" ? (
          <div key={s.id} className="flex flex-col gap-1">
            {body}
          </div>
        ) : (
          <Link key={s.id} href={`/plan/sessions/${s.id}`} className="flex flex-col gap-1">
            {body}
          </Link>
        );
      })}
      {day.unlinkedRuns.map((r) => (
        <Link key={r.id} href={`/activities/${r.id}`} className="text-xs text-muted hover:underline">
          Run · {formatDistanceValue(r.km, units)} {units}
          <span className="sr-only"> on {dayLabel(day.date)}</span>
        </Link>
      ))}
    </div>
  );
}

function WeekCell({ plan, units }: { plan: CalendarWeek["plan"]; units: Units }) {
  if (!plan) return <div />;
  return (
    <div
      className={`flex flex-col justify-center gap-0.5 rounded-xl border border-l-4 border-border bg-surface px-2 py-1.5 ${PHASE_BORDER[plan.phase]} ${plan.isCurrent ? "ring-2 ring-accent" : ""}`}
    >
      <span className={`text-xs ${plan.isCurrent ? "font-bold text-accent" : "text-muted"}`}>
        Week {plan.number} · {PHASE_LABELS[plan.phase]}
      </span>
      <span className="font-condensed text-base leading-none font-bold">
        {toDisplayDistance(plan.actualKm, units).toFixed(0)}
        <small className="text-[10px] font-semibold text-muted">
          {" "}
          / {toDisplayDistance(plan.plannedKm, units).toFixed(0)} {units}
        </small>
      </span>
      <span className={`h-1 w-full rounded-full ${PHASE_BG[plan.phase]}`} aria-hidden="true" />
    </div>
  );
}

/** Month view of the plan: one cell per day, a weekly total on the right. Desktop only (the page hides it below lg). */
export function MonthCalendar({ grid, units }: { grid: MonthGrid; units: Units }) {
  const headers = grid.weeks[0]?.days.map((d) => WEEKDAY_LABELS[isoWeekday(d.date)].short) ?? [];
  return (
    <section aria-label="Month calendar" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <NavLink month={grid.prev} label="‹" aria="Previous month" />
        <h2 className="font-condensed text-2xl leading-none font-extrabold uppercase italic">
          {monthTitle(grid.month)}
        </h2>
        <NavLink month={grid.next} label="›" aria="Next month" />
        <Link href="/plan" className={NAV_BTN}>
          Today
        </Link>
        <span className="flex-1" />
        <span className="text-xs text-muted">✓ done · ! missed</span>
      </div>
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_6rem] gap-1.5">
        {[...headers, "Week"].map((h) => (
          <span key={h} className="px-1 text-xs font-bold tracking-wider text-muted uppercase">
            {h}
          </span>
        ))}
        {grid.weeks.map((w) => [
          ...w.days.map((d) => <DayCell key={d.date} day={d} units={units} />),
          <WeekCell key={`${w.start}-week`} plan={w.plan} units={units} />,
        ])}
      </div>
    </section>
  );
}
