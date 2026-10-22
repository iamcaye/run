"use client";

import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { WORKOUT_LIMITS as L } from "@/config/training";
import type { BuilderAction, BuilderState } from "@/lib/custom-plans/builder-reducer";
import { weekTotals } from "@/lib/custom-plans/ops";
import { formatDistance, formatDistanceValue, type Units } from "@/lib/units";

type Props = { state: BuilderState; units: Units; dispatch: (a: BuilderAction) => void };

const dashed =
  "rounded-[10px] border-[1.5px] border-dashed border-border px-2 py-1.5 text-xs font-semibold text-muted hover:border-foreground hover:text-foreground disabled:opacity-40";
const menuItem = "w-full rounded-lg px-2! py-1.5! text-left text-sm hover:bg-background disabled:opacity-40";
const chipAction = "rounded-lg px-2! py-1! text-sm hover:bg-surface disabled:opacity-40";

/** Closes the disclosure menu an action was picked from. */
const closeMenu = (el: HTMLElement) => el.closest("details")?.removeAttribute("open");

/** Move up / Move down / Delete week (with confirmation). */
function WeekActions({ index, count, dispatch, itemClass }: { index: number; count: number; dispatch: Props["dispatch"]; itemClass: string }) {
  return (
    <>
      <button
        type="button"
        className={itemClass}
        disabled={index === 0}
        onClick={(e) => {
          closeMenu(e.currentTarget);
          dispatch({ type: "moveWeek", from: index, to: index - 1 });
        }}
      >
        Move up
      </button>
      <button
        type="button"
        className={itemClass}
        disabled={index === count - 1}
        onClick={(e) => {
          closeMenu(e.currentTarget);
          dispatch({ type: "moveWeek", from: index, to: index + 1 });
        }}
      >
        Move down
      </button>
      <form action={() => dispatch({ type: "removeWeek", index })}>
        <ConfirmSubmitButton
          variant="secondary"
          className={`${itemClass} border-none bg-transparent! font-normal! text-danger`}
          disabled={count <= 1}
          confirmMessage={`Delete week ${index + 1} and its workouts?`}
        >
          Delete week
        </ConfirmSubmitButton>
      </form>
    </>
  );
}

/** The week actions in a small disclosure menu (lg+ week rows). */
function WeekMenu({ index, count, dispatch }: { index: number; count: number; dispatch: Props["dispatch"] }) {
  return (
    <details className="relative">
      <summary
        aria-label={`More actions for week ${index + 1}`}
        className="flex size-6 cursor-pointer list-none items-center justify-center rounded-lg text-base leading-none hover:bg-background hover:text-foreground [&::-webkit-details-marker]:hidden"
      >
        ⋯
      </summary>
      <div className="absolute top-8 left-0 z-20 flex w-40 flex-col gap-0.5 rounded-xl border border-border bg-surface p-1.5 text-foreground shadow-lg">
        <WeekActions index={index} count={count} dispatch={dispatch} itemClass={menuItem} />
      </div>
    </details>
  );
}

/** Left column (lg+): every week with its volume and actions, plus the plan's volume profile. */
export function WeekList({ state, units, dispatch }: Props) {
  const weeks = state.doc.weeks;
  const kms = weeks.map((w) => weekTotals(w).km);
  const max = Math.max(...kms, 1);
  const full = weeks.length >= L.maxWeeks;

  return (
    <section aria-labelledby="weeks-heading" className="hidden flex-col gap-1 rounded-[20px] bg-surface p-3 lg:flex">
      <h2 id="weeks-heading" className="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">
        Weeks · {units}
      </h2>
      <ol className="flex flex-col gap-1">
        {weeks.map((w, i) => {
          const on = i === state.selectedWeek;
          return (
            <li key={w.id} className={`flex items-center gap-0.5 rounded-[10px] py-1 pr-0.5 pl-2 ${on ? "bg-foreground text-background" : ""}`}>
              <button
                type="button"
                onClick={() => dispatch({ type: "selectWeek", index: i })}
                aria-current={on ? "true" : undefined}
                className="flex min-w-0 flex-1 items-baseline justify-between gap-1 text-left text-sm font-semibold whitespace-nowrap"
              >
                <span>Week {i + 1}</span>
                <span className={`text-xs font-normal tabular-nums ${on ? "" : "text-muted"}`}>{formatDistanceValue(kms[i]!, units)}</span>
              </button>
              <button
                type="button"
                disabled={full}
                onClick={() => dispatch({ type: "duplicateWeek", index: i })}
                aria-label={`Duplicate week ${i + 1}`}
                title="Duplicate"
                className="flex size-6 shrink-0 items-center justify-center rounded-lg text-sm hover:bg-background hover:text-foreground disabled:opacity-40"
              >
                ⧉
              </button>
              <WeekMenu index={i} count={weeks.length} dispatch={dispatch} />
            </li>
          );
        })}
      </ol>
      <button type="button" className={`${dashed} mt-1`} disabled={full} onClick={() => dispatch({ type: "addWeek" })}>
        + Empty week
      </button>

      <h3 className="mt-4 text-xs font-semibold tracking-wider text-muted uppercase">Volume</h3>
      <div role="img" aria-label={`Weekly volume: ${kms.map((k) => formatDistanceValue(k, units)).join(", ")} ${units}`} className="flex h-12 items-end gap-[3px]">
        {kms.map((k, i) => (
          <div
            key={weeks[i]!.id}
            className={`flex-1 rounded-t-[3px] ${i === state.selectedWeek ? "bg-accent" : "bg-track"}`}
            style={{ height: `${Math.max((k / max) * 100, 4)}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span>W1</span>
        {weeks.length > 1 ? <span>W{weeks.length}</span> : null}
      </div>
    </section>
  );
}

/** Below lg: the weeks as scrollable chips; the selected one carries Duplicate and its menu. */
export function WeekChips({ state, units, dispatch }: Props) {
  const weeks = state.doc.weeks;
  const full = weeks.length >= L.maxWeeks;
  return (
    <div className="flex flex-col gap-1 lg:hidden">
      <nav aria-label="Weeks" className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-1">
        {weeks.map((w, i) => {
          const on = i === state.selectedWeek;
          return (
            <div key={w.id} className={`flex shrink-0 items-center gap-1 rounded-full ${on ? "bg-foreground py-1 pr-1 pl-3 text-background" : ""}`}>
              <button
                type="button"
                onClick={() => dispatch({ type: "selectWeek", index: i })}
                aria-current={on ? "true" : undefined}
                className={`text-sm font-semibold whitespace-nowrap tabular-nums ${on ? "" : "rounded-full border border-border bg-surface px-3 py-1.5"}`}
              >
                W{i + 1} · {formatDistance(weekTotals(w).km, units, 0)}
              </button>
              {on ? (
                <button
                  type="button"
                  disabled={full}
                  onClick={() => dispatch({ type: "duplicateWeek", index: i })}
                  className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-foreground disabled:opacity-40"
                >
                  ⧉ Duplicate
                </button>
              ) : null}
            </div>
          );
        })}
        <button type="button" className={`${dashed} shrink-0 rounded-full px-3`} disabled={full} onClick={() => dispatch({ type: "addWeek" })}>
          + Week
        </button>
      </nav>
      <div className="flex items-center gap-1 text-sm">
        <span className="mr-1 text-xs font-semibold tracking-wider text-muted uppercase">Week {state.selectedWeek + 1}</span>
        <WeekActions index={state.selectedWeek} count={weeks.length} dispatch={dispatch} itemClass={chipAction} />
      </div>
    </div>
  );
}
