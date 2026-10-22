"use client";

import type { DragEvent } from "react";
import { useState } from "react";
import { StructureBar } from "@/components/plan/structure-bar";
import type { BuilderAction } from "@/lib/custom-plans/builder-reducer";
import { estimateWorkout } from "@/lib/custom-plans/estimate";
import type { DaySlot, PlanWorkout } from "@/lib/custom-plans/types";
import type { StepTarget, StructureStep } from "@/lib/planning/types";
import { WEEKDAY_LABELS } from "@/lib/time";
import { formatDistance, formatPace, type Units } from "@/lib/units";
import type { LibraryWorkout } from "@/server/actions/workouts";

/** dataTransfer type of everything draggable in the builder. */
export const DRAG_TYPE = "application/x-plan-workout";
export type DragPayload = { kind: "library"; id: string } | { kind: "slot"; slot: DaySlot };

export function startDrag(e: DragEvent, payload: DragPayload) {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = payload.kind === "library" ? "copy" : "move";
}

/** The default workout "+ workout" drops on an empty day. */
export const DEFAULT_WORKOUT: PlanWorkout = { name: "Easy run", type: "easy", notes: null, steps: [{ kind: "steady", km: 8 }] };

export const fromLibrary = ({ name, type, notes, steps }: LibraryWorkout): PlanWorkout => structuredClone({ name, type, notes, steps });

function targetLabel(t: StepTarget, units: Units): string {
  if (t.kind === "pace") return formatPace(t.secPerKm, units);
  if (t.kind === "hr_zone") return `Z${t.zone}`;
  return `RPE ${t.rpe}`;
}

/** The target of the main (work) block: the first repeat, else the first steady block. */
function mainTarget(steps: readonly StructureStep[], units: Units): string | null {
  const main = steps.find((s) => s.kind === "reps") ?? steps.find((s) => s.kind === "steady");
  if (!main) return null;
  if (main.target) return targetLabel(main.target, units);
  return main.paceSecPerKm ? formatPace(main.paceSecPerKm, units) : null;
}

export function workoutSummary(w: PlanWorkout, units: Units): string {
  const km = `≈ ${formatDistance(estimateWorkout(w.steps).km, units)}`;
  const target = mainTarget(w.steps, units);
  return target ? `${km} · ${target}` : km;
}

type Props = {
  slot: DaySlot;
  workout: PlanWorkout | null;
  selected: boolean;
  library: LibraryWorkout[];
  units: Units;
  dispatch: (a: BuilderAction) => void;
};

/** One day of the week grid: a workout card (draggable, tap to edit) or the ways to fill the day. */
export function DayCell({ slot, workout, selected, library, units, dispatch }: Props) {
  const [over, setOver] = useState(false);
  const label = WEEKDAY_LABELS[slot.day];

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === "copy" ? "copy" : "move";
    setOver(true);
  };
  const onDrop = (e: DragEvent) => {
    setOver(false);
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return;
    e.preventDefault();
    const p = JSON.parse(raw) as DragPayload;
    if (p.kind === "slot") {
      if (p.slot.week !== slot.week || p.slot.day !== slot.day) dispatch({ type: "move", from: p.slot, to: slot });
      return;
    }
    const w = library.find((l) => l.id === p.id);
    if (w) dispatch({ type: "setDay", slot, workout: fromLibrary(w) });
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`flex gap-3 rounded-xl bg-background p-2 lg:min-h-40 lg:flex-col lg:gap-1.5 ${over ? "outline-2 outline-accent" : ""}`}
    >
      <span className="w-9 shrink-0 pt-2 text-xs font-bold text-muted uppercase lg:w-auto lg:pt-0">
        <span aria-hidden>{label.short}</span>
        <span className="sr-only">{label.long}</span>
      </span>
      {workout ? (
        <button
          type="button"
          draggable
          onDragStart={(e) => startDrag(e, { kind: "slot", slot })}
          onClick={() => dispatch({ type: "select", slot })}
          aria-pressed={selected}
          className={`flex min-w-0 flex-1 cursor-grab flex-col gap-1 rounded-[10px] border-[1.5px] bg-surface p-2 text-left lg:flex-none ${
            selected ? "border-accent ring-3 ring-accent/15" : "border-transparent hover:border-border"
          }`}
        >
          <span className="text-sm leading-tight font-semibold break-words">{workout.name}</span>
          <span className="text-xs text-muted tabular-nums">{workoutSummary(workout, units)}</span>
          <StructureBar steps={workout.steps} units={units} size="sm" />
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <button
            type="button"
            onClick={() => dispatch({ type: "setDay", slot, workout: structuredClone(DEFAULT_WORKOUT) })}
            aria-label={`Add a workout on ${label.long}`}
            className="rounded-[10px] border-[1.5px] border-dashed border-border px-2 py-2.5 text-xs font-semibold text-muted hover:border-foreground hover:text-foreground"
          >
            + workout
          </button>
          {library.length ? (
            <select
              aria-label={`Add from My workouts on ${label.long}`}
              value=""
              onChange={(e) => {
                const w = library.find((l) => l.id === e.target.value);
                if (w) dispatch({ type: "setDay", slot, workout: fromLibrary(w) });
              }}
              className="w-full rounded-[10px] border border-border bg-surface px-1.5 py-1.5 text-xs text-muted"
            >
              <option value="">My workouts…</option>
              {library.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      )}
    </div>
  );
}
