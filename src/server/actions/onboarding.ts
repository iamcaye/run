"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { availabilitySchema, preferencesSchema } from "@/lib/validation/settings";
import { requireUserContext } from "@/server/context";
import { completeOnboarding } from "@/services/settings";
import { z } from "zod";
import { isShareToken } from "@/lib/custom-plans/share";
import { isLocalDate } from "@/lib/time";
import { followSharedPlan } from "@/services/sharing";
import { failure, formValues, invalid, type FormState } from "./form-state";

const settingsStepSchema = preferencesSchema.and(availabilitySchema);

export async function saveOnboardingSettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { scope } = await requireUserContext();
  const parsed = settingsStepSchema.safeParse(formValues(formData, ["runDays"]));
  if (!parsed.success) return invalid(parsed.error);
  await scope.settings.update(parsed.data);
  const plan = formData.get("plan");
  redirect(isShareToken(plan) ? `/onboarding?step=start&plan=${plan}` : "/onboarding?step=goal");
}

/** Onboarding: follow the shared plan and make it active. */
export async function startSharedPlanAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { scope, today } = await requireUserContext();
  if (!isShareToken(token)) return failure("This link is no longer active.");
  const parsed = z
    .object({ startDate: z.string().refine(isLocalDate, "Pick a valid date").optional() })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const result = await followSharedPlan(scope, token, { activate: true, startDate: parsed.data.startDate ?? today }, today);
  if (!result.ok) return failure(result.code === "inactive" ? "This link is no longer active." : result.message);
  if (result.kind === "own") redirect("/onboarding?step=goal");
  revalidatePath("/plan");
  revalidatePath("/dashboard");
  redirect(`/onboarding?step=plan&plan=${token}`);
}

export async function finishOnboardingAction(): Promise<void> {
  const { scope } = await requireUserContext();
  await completeOnboarding(scope);
  redirect("/dashboard");
}
