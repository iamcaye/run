"use client";

import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { WORKOUT_LIMITS as L } from "@/config/training";
import { createCustomPlanAction } from "@/server/actions/custom-plans";

/** Name-only form: the plan opens in the builder with one empty week. */
export function NewPlanForm() {
  const { state, onSubmit, pending } = useFormAction(createCustomPlanAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Field
          label="Plan name"
          name="name"
          required
          maxLength={L.nameMax}
          placeholder="e.g. Base 10K · 8 weeks"
          error={state.fieldErrors?.name}
        />
      </div>
      <SubmitButton pending={pending} pendingLabel="Creating…">
        New plan
      </SubmitButton>
      {state.status === "error" && !state.fieldErrors ? <FormError>{state.message}</FormError> : null}
    </form>
  );
}
