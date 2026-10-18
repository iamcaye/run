"use client";

import { Field, FormError, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { EDITABLE_SESSION_TYPES, SESSION_LABELS } from "@/lib/planning/describe";
import type { FormState } from "@/server/actions/form-state";

const typeOptions = EDITABLE_SESSION_TYPES.map((t) => ({ value: t, label: SESSION_LABELS[t] }));

export function SessionEditForm({
  action,
  defaults,
  units,
  maxDate,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: { date: string; type: string; distance: string; effortDescription: string };
  units: "km" | "mi";
  maxDate: string;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  const errors = state.fieldErrors;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Date" name="date" type="date" max={maxDate} defaultValue={defaults.date} required error={errors?.date} />
      <Select label="Session type" name="type" defaultValue={defaults.type} options={typeOptions} error={errors?.type} />
      <Field
        label={`Distance (${units})`}
        name="distance"
        type="number"
        inputMode="decimal"
        step="0.5"
        min="0"
        defaultValue={defaults.distance}
        error={errors?.distance}
      />
      <Textarea
        label="Notes / effort"
        name="effortDescription"
        defaultValue={defaults.effortDescription}
        error={errors?.effortDescription}
      />
      <p className="text-xs text-muted">
        Edited sessions are kept as you set them — regeneration and weekly adjustments won&apos;t change them.
      </p>
      <FormError>{state.status === "error" ? state.message : null}</FormError>
      <SubmitButton pending={pending} pendingLabel="Saving…" className="self-start">
        Save session
      </SubmitButton>
    </form>
  );
}
