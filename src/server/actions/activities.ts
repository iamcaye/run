"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { manualRunSchema, rpeNotesSchema } from "@/lib/validation/activity";
import { requireUserContext } from "@/server/context";
import { deleteManualActivity, logManualRun } from "@/services/activities";
import { failure, formValues, invalid, type FormState } from "./form-state";

function revalidate(id?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/activities");
  revalidatePath("/log");
  revalidatePath("/plan");
  if (id) revalidatePath(`/activities/${id}`);
}

export async function updateRpeNotesAction(activityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await requireUserContext();
  if (!z.uuid().safeParse(activityId).success) return failure("Run not found");
  const parsed = rpeNotesSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const updated = await scope.activities.update(activityId, parsed.data);
  if (!updated) return failure("Run not found");
  revalidate(activityId);
  return { status: "success", message: parsed.data.rpe ? `Saved — RPE ${parsed.data.rpe}.` : "Saved." };
}

export async function logManualRunAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { scope, settings, today } = await requireUserContext();
  const parsed = manualRunSchema({ today, units: settings.units }).safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { activity } = await logManualRun(scope, parsed.data, settings);
  revalidate(activity.id);
  redirect(`/activities/${activity.id}?logged=1`);
}

export async function deleteActivityAction(activityId: string): Promise<void> {
  const { scope } = await requireUserContext();
  if (!z.uuid().safeParse(activityId).success) return;
  await deleteManualActivity(scope, activityId);
  revalidate();
  redirect("/activities");
}
