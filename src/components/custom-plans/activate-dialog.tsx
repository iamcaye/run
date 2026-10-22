"use client";

import { useRef } from "react";
import { Button, Field, FormError, SubmitButton } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { addDays, isoWeekday, type LocalDate } from "@/lib/time";
import type { FormState } from "@/server/actions/form-state";

/** Next Monday, or today when today is a Monday (plan weeks run Mon–Sun). */
export function nextMonday(today: LocalDate): LocalDate {
  return addDays(today, (8 - isoWeekday(today)) % 7);
}

/** "Activate" button plus a modal asking for the start date. */
export function ActivateDialog({
  action,
  today,
  replacesActive,
  disabledReason,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  today: LocalDate;
  replacesActive: boolean;
  /** Why activation isn't possible right now (e.g. unsaved changes); null when it is. */
  disabledReason: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { state, onSubmit, pending } = useFormAction(action);

  return (
    <>
      <Button type="button" onClick={() => ref.current?.showModal()} disabled={disabledReason !== null} title={disabledReason ?? undefined}>
        Activate
      </Button>
      <dialog
        ref={ref}
        aria-labelledby="activate-heading"
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-[20px] bg-surface p-5 text-foreground backdrop:bg-foreground/40"
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <h2 id="activate-heading" className="font-condensed text-2xl font-extrabold uppercase">
            Activate plan
          </h2>
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
          {replacesActive ? (
            <p className="rounded-xl bg-background p-3 text-sm">
              This replaces your active goal/plan. Its past and completed sessions stay; its upcoming ones are removed.
            </p>
          ) : null}
          {state.status === "error" && !state.fieldErrors ? <FormError>{state.message}</FormError> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => ref.current?.close()}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingLabel="Activating…">
              Activate
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
