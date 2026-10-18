"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { idle, type FormState } from "@/server/actions/form-state";

/**
 * useActionState wired through onSubmit instead of `<form action>`, so React doesn't reset the
 * form after submit — on a validation error the user keeps what they typed.
 */
export function useFormAction(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  const [state, dispatch, pending] = useActionState(action, idle);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  };
  return { state, onSubmit, pending };
}
