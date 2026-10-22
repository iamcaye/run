"use client";

import type { BuilderAction, BuilderState } from "@/lib/custom-plans/builder-reducer";
import { weekTotals } from "@/lib/custom-plans/ops";
import { ISO_WEEKDAYS } from "@/lib/time";
import { formatDistance, type Units } from "@/lib/units";
import type { LibraryWorkout } from "@/server/actions/workouts";
import { DayCell } from "./day-cell";
import { WorkoutLibrary } from "./workout-library";

/** "3 h 25 min" / "45 min". */
export function hoursLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const navButton = "rounded-lg px-2 py-1 text-sm font-semibold text-muted hover:text-foreground disabled:invisible";

/** The selected week: totals, prev/next, its seven days, and My workouts below. */
export function WeekGrid({
  state,
  library,
  units,
  dispatch,
}: {
  state: BuilderState;
  library: LibraryWorkout[];
  units: Units;
  dispatch: (a: BuilderAction) => void;
}) {
  const index = state.selectedWeek;
  const week = state.doc.weeks[index];
  if (!week) return null;
  const t = weekTotals(week);
  const count = state.doc.weeks.length;

  return (
    <section aria-labelledby="week-heading" className="flex min-w-0 flex-col gap-3 rounded-[20px] bg-surface p-3 lg:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="week-heading" className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-condensed text-2xl font-extrabold uppercase">Week {index + 1}</span>
          <span className="text-sm text-muted tabular-nums">
            {formatDistance(t.km, units)} · {hoursLabel(t.seconds)} · {t.quality} quality
          </span>
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={navButton}
            disabled={index === 0}
            onClick={() => dispatch({ type: "selectWeek", index: index - 1 })}
          >
            ‹ Week {index}
          </button>
          <button
            type="button"
            className={navButton}
            disabled={index === count - 1}
            onClick={() => dispatch({ type: "selectWeek", index: index + 1 })}
          >
            Week {index + 2} ›
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:grid lg:grid-cols-7">
        {ISO_WEEKDAYS.map((day) => (
          <DayCell
            key={day}
            slot={{ week: index, day }}
            workout={week.days[day - 1] ?? null}
            selected={state.selected?.week === index && state.selected.day === day}
            library={library}
            units={units}
            dispatch={dispatch}
          />
        ))}
      </div>

      <WorkoutLibrary library={library} />
    </section>
  );
}
