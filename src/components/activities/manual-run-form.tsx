"use client";

import { Field, FormError, SubmitButton, Textarea } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { logManualRunAction } from "@/server/actions/activities";
import { RpePicker } from "./rpe-picker";

export function ManualRunForm({ today, units }: { today: string; units: "km" | "mi" }) {
  const { state, onSubmit, pending } = useFormAction(logManualRunAction);
  const e = state.fieldErrors;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" name="date" type="date" max={today} defaultValue={today} required error={e?.date} />
        <Field label="Start time" name="time" type="time" defaultValue="" error={e?.time} />
        <Field
          label={`Distance (${units})`}
          name="distance"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.1"
          required
          error={e?.distance}
        />
        <Field label="Duration" name="duration" placeholder="45:30" inputMode="numeric" hint="mm:ss or h:mm:ss" required error={e?.duration} />
      </div>
      <RpePicker error={e?.rpe} />
      <Textarea label="Notes" name="notes" error={e?.notes} />
      <FormError>{state.status === "error" ? state.message : null}</FormError>
      <SubmitButton pending={pending} pendingLabel="Saving…" className="w-full sm:w-auto sm:self-start">
        Log run
      </SubmitButton>
    </form>
  );
}
