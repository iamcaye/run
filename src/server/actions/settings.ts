"use server";

import { revalidatePath } from "next/cache";
import {
  availabilitySchema,
  heartRateSchema,
  preferencesSchema,
  profileSchema,
} from "@/lib/validation/settings";
import { requireUserContext } from "@/server/context";
import * as settingsService from "@/services/settings";
import { formValues, invalid, type FormState } from "./form-state";

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await requireUserContext();
  const parsed = profileSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  await scope.profile.updateName(parsed.data.name);
  revalidatePath("/", "layout");
  return { status: "success", message: "Profile saved." };
}

export async function updatePreferencesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await requireUserContext();
  const parsed = preferencesSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { planAffected } = await settingsService.updatePreferences(scope, parsed.data);
  revalidatePath("/", "layout");
  return { status: "success", message: "Preferences saved.", planAffected };
}

export async function updateAvailabilityAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await requireUserContext();
  const parsed = availabilitySchema.safeParse(formValues(formData, ["runDays"]));
  if (!parsed.success) return invalid(parsed.error);
  const { planAffected } = await settingsService.updateAvailability(scope, parsed.data);
  revalidatePath("/", "layout");
  return { status: "success", message: "Availability saved.", planAffected };
}

export async function updateHeartRateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await requireUserContext();
  const parsed = heartRateSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  await scope.settings.update(parsed.data);
  revalidatePath("/settings");
  return { status: "success", message: "Heart rate saved." };
}
