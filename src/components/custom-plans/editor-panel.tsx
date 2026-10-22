"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/form";
import { WorkoutEditor } from "@/components/workouts/workout-editor";
import type { BuilderAction, BuilderState } from "@/lib/custom-plans/builder-reducer";
import { ISO_WEEKDAYS, WEEKDAY_LABELS, type IsoWeekday } from "@/lib/time";
import type { Units } from "@/lib/units";
import { saveWorkoutToLibraryAction, type LibraryWorkout } from "@/server/actions/workouts";

const daySelect = "w-full rounded-xl border border-border bg-surface px-2 py-2 text-sm";

/**
 * The selected day's workout in the block editor. Right column on lg+; below lg a full-screen
 * sheet closed with Done.
 */
export function EditorPanel({
  state,
  units,
  dispatch,
  onSavedToLibrary,
}: {
  state: BuilderState;
  units: Units;
  dispatch: (a: BuilderAction) => void;
  onSavedToLibrary: (w: LibraryWorkout) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const slot = state.selected;
  const workout = slot ? (state.doc.weeks[slot.week]?.days[slot.day - 1] ?? null) : null;

  if (!slot || !workout) {
    return (
      <aside className="hidden rounded-[20px] bg-surface p-4 text-sm text-muted lg:block">
        Select a workout to edit it here, or add one with “+ workout”.
      </aside>
    );
  }

  const otherDays = ISO_WEEKDAYS.filter((d) => d !== slot.day);
  const toSlot = (value: string) => ({ week: slot.week, day: Number(value) as IsoWeekday });

  const saveToLibrary = () =>
    startTransition(async () => {
      const r = await saveWorkoutToLibraryAction(workout);
      if (r.status === "saved") onSavedToLibrary(r.workout);
      setNote(r.status === "saved" ? "Saved to My workouts." : r.message);
    });

  return (
    <aside
      aria-labelledby="editor-heading"
      className="fixed inset-0 z-[1001] flex flex-col gap-4 overflow-y-auto bg-background p-4 lg:static lg:z-auto lg:self-start lg:rounded-[20px] lg:bg-surface"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="editor-heading" className="text-xs font-semibold tracking-wider text-muted uppercase">
          {WEEKDAY_LABELS[slot.day].long} · Week {slot.week + 1}
        </h2>
        <Button type="button" variant="ink" className="px-4! py-1.5! lg:hidden" onClick={() => dispatch({ type: "select", slot: null })}>
          Done
        </Button>
      </div>

      <WorkoutEditor
        value={workout}
        onChange={(next) => {
          setNote(null);
          dispatch({ type: "setDay", slot, workout: next });
        }}
        units={units}
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Move to…
          <select className={daySelect} value="" onChange={(e) => e.target.value && dispatch({ type: "move", from: slot, to: toSlot(e.target.value) })}>
            <option value="">Pick a day</option>
            {otherDays.map((d) => (
              <option key={d} value={d}>
                {WEEKDAY_LABELS[d].long}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Copy to…
          <select className={daySelect} value="" onChange={(e) => e.target.value && dispatch({ type: "copy", from: slot, to: toSlot(e.target.value) })}>
            <option value="">Pick a day</option>
            {otherDays.map((d) => (
              <option key={d} value={d}>
                {WEEKDAY_LABELS[d].long}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted">Moving onto a day that has a workout swaps the two; copying replaces it.</p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={saveToLibrary} disabled={pending || workout.name.trim() === ""}>
          {pending ? "Saving…" : "Save to My workouts"}
        </Button>
        <Button type="button" variant="secondary" className="text-danger" onClick={() => dispatch({ type: "setDay", slot, workout: null })}>
          Remove
        </Button>
      </div>
      {note ? (
        <p role="status" className="text-sm text-muted">
          {note}
        </p>
      ) : null}
    </aside>
  );
}
