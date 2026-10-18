"use server";

import { redirect } from "next/navigation";
import { availabilitySchema, preferencesSchema } from "@/lib/validation/settings";
import { requireUserContext } from "@/server/context";
import { completeOnboarding } from "@/services/settings";
import { formValues, invalid, type FormState } from "./form-state";

const settingsStepSchema = preferencesSchema.and(availabilitySchema);

export async function saveOnboardingSettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { scope } = await requireUserContext();
  const parsed = settingsStepSchema.safeParse(formValues(formData, ["runDays"]));
  if (!parsed.success) return invalid(parsed.error);
  await scope.settings.update(parsed.data);
  redirect("/onboarding?step=goal");
}

export async function finishOnboardingAction(): Promise<void> {
  const { scope } = await requireUserContext();
  await completeOnboarding(scope);
  redirect("/dashboard");
}
