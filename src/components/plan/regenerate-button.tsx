"use client";

import { FormError, FormSuccess, SubmitButton } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { regeneratePlanAction } from "@/server/actions/plans";

export function RegenerateButton({ goalId }: { goalId: string }) {
  const { state, onSubmit, pending } = useFormAction(regeneratePlanAction.bind(null, goalId));
  return (
    <form
      onSubmit={(e) => {
        if (!window.confirm("Regenerate all future sessions? Past, completed and hand-edited sessions are kept.")) {
          e.preventDefault();
          return;
        }
        onSubmit(e);
      }}
      className="flex flex-col gap-2"
    >
      <SubmitButton variant="secondary" pending={pending} pendingLabel="Regenerating…" className="self-start">
        Regenerate future sessions
      </SubmitButton>
      <FormError>{state.status === "error" ? state.message : null}</FormError>
      <FormSuccess>{state.status === "success" ? state.message : null}</FormSuccess>
    </form>
  );
}
