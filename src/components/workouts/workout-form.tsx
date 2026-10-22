"use client";

import { useState, useTransition } from "react";
import { Button, FormError, FormSuccess } from "@/components/ui/form";
import type { PlanWorkout } from "@/lib/custom-plans/types";
import type { Units } from "@/lib/units";
import { idle, type FormState } from "@/server/actions/form-state";
import { deleteWorkoutAction, saveWorkoutAction } from "@/server/actions/workouts";
import { WorkoutEditor } from "./workout-editor";

/** Editor plus Save / Delete for one saved workout (`id` null = a new one). */
export function WorkoutForm({ id, initial, units }: { id: string | null; initial: PlanWorkout; units: Units }) {
  const [workout, setWorkout] = useState(initial);
  const [state, setState] = useState<FormState>(idle);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setState(await saveWorkoutAction(id, workout));
    });

  const remove = () => {
    if (!id || !window.confirm(`Delete “${workout.name || "this workout"}”? This can't be undone.`)) return;
    startTransition(() => deleteWorkoutAction(id));
  };

  return (
    <div className="flex flex-col gap-4">
      <WorkoutEditor
        value={workout}
        onChange={(next) => {
          setWorkout(next);
          if (state.status !== "idle") setState(idle);
        }}
        units={units}
      />
      {state.status === "error" ? <FormError>{state.message}</FormError> : null}
      {state.status === "success" ? <FormSuccess>{state.message}</FormSuccess> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={save} disabled={pending || workout.name.trim() === ""}>
          {pending ? "Saving…" : id ? "Save changes" : "Save workout"}
        </Button>
        {id ? (
          <Button type="button" variant="secondary" onClick={remove} disabled={pending}>
            Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
}
