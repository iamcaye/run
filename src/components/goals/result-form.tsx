"use client";

import { Field, FormError, FormSuccess, SubmitButton } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import type { FormState } from "@/server/actions/form-state";

export function ResultForm({ action }: { action: (prev: FormState, formData: FormData) => Promise<FormState> }) {
  const { state, onSubmit, pending } = useFormAction(action);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field
        label="Official finish time"
        name="resultTime"
        placeholder="1:43:12"
        inputMode="numeric"
        hint="h:mm:ss or mm:ss"
        required
        error={state.fieldErrors?.resultTime}
      />
      <FormError>{state.status === "error" ? state.message : null}</FormError>
      <FormSuccess>{state.status === "success" ? state.message : null}</FormSuccess>
      <SubmitButton pending={pending} pendingLabel="Saving…" className="self-start">
        Save result
      </SubmitButton>
    </form>
  );
}
