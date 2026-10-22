"use client";

import { Checkbox, Field, FormError, SubmitButton } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import type { LocalDate } from "@/lib/time";
import type { FormState } from "@/server/actions/form-state";
import { nextMonday } from "./activate-dialog";

export function FollowForm({
  action,
  today,
  showActivate,
  replacesActive,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  today: LocalDate;
  showActivate: boolean;
  replacesActive: boolean;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field
        label="Start date"
        name="startDate"
        type="date"
        required
        min={today}
        defaultValue={nextMonday(today)}
        hint="Week 1 is the Mon–Sun week of this date; any days before it are skipped."
        error={state.fieldErrors?.startDate}
      />
      {showActivate ? (
        <div className="flex flex-col gap-1">
          <Checkbox label="Activate now" name="activate" defaultChecked />
          <p className="text-sm text-muted">
            Unticked, the plan is just added to My plans.
            {replacesActive ? " This replaces your active goal/plan." : ""}
          </p>
        </div>
      ) : null}
      {state.status === "error" && !state.fieldErrors ? <FormError>{state.message}</FormError> : null}
      <SubmitButton pending={pending} pendingLabel="Following…">
        Follow plan
      </SubmitButton>
    </form>
  );
}
