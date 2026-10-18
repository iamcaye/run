import { z } from "zod";

/** Shape returned by every form Server Action (consumed with useActionState). */
export type FormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Set when the change should offer to regenerate future plan sessions. */
  planAffected?: boolean;
  /** A value shown to the user exactly once (e.g. a new import token). */
  secret?: string;
};

export const idle: FormState = { status: "idle" };

export function invalid(error: z.ZodError): FormState {
  return {
    status: "error",
    message: "Please fix the highlighted fields.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[] | undefined>,
  };
}

export function failure(message: string): FormState {
  return { status: "error", message };
}

/** FormData → plain object; keys listed in `multi` keep all values as arrays. */
export function formValues(formData: FormData, multi: readonly string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    out[key] = multi.includes(key) ? formData.getAll(key) : formData.get(key);
  }
  for (const key of multi) out[key] ??= [];
  return out;
}
