"use client";

import { FormError, FormSuccess, SubmitButton, Textarea } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { updateRpeNotesAction } from "@/server/actions/activities";
import { RpePicker } from "./rpe-picker";

export function RpeNotesForm({
  activityId,
  rpe,
  notes,
}: {
  activityId: string;
  rpe: number | null;
  notes: string | null;
}) {
  const { state, onSubmit, pending } = useFormAction(updateRpeNotesAction.bind(null, activityId));
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <RpePicker defaultValue={rpe} error={state.fieldErrors?.rpe} />
      <Textarea label="Notes" name="notes" defaultValue={notes ?? ""} placeholder="Windy, heavy legs…" error={state.fieldErrors?.notes} />
      <FormError>{state.status === "error" ? state.message : null}</FormError>
      <FormSuccess>{state.status === "success" ? state.message : null}</FormSuccess>
      <SubmitButton pending={pending} pendingLabel="Saving…" className="w-full sm:w-auto sm:self-start">
        Save
      </SubmitButton>
    </form>
  );
}
