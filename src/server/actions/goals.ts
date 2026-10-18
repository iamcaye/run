"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseDuration } from "@/lib/units";
import { goalFormSchema } from "@/lib/validation/goal";
import { requireUserContext } from "@/server/context";
import * as goals from "@/services/goals";
import { failure, formValues, invalid, type FormState } from "./form-state";

/** Post-submit destinations a form may request (no open redirects). */
const RedirectTarget = z.enum(["/goals", "/onboarding?step=plan"]).catch("/goals");

const uuid = z.uuid();

function revalidateGoals() {
  revalidatePath("/goals");
  revalidatePath("/dashboard");
}

export async function createGoalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { scope, settings, today } = await requireUserContext();
  const parsed = goalFormSchema({ today, units: settings.units, requireFutureDate: true }).safeParse(
    formValues(formData),
  );
  if (!parsed.success) return invalid(parsed.error);
  const result = await goals.createGoal(scope, parsed.data, {
    makeActive: formData.get("makeActive") === "on",
  });
  if (!result.ok) return failure(result.message);
  revalidateGoals();
  redirect(RedirectTarget.parse(formData.get("redirectTo")));
}

export async function updateGoalAction(
  goalId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { scope, settings, today } = await requireUserContext();
  if (!uuid.safeParse(goalId).success) return failure("Goal not found");
  const parsed = goalFormSchema({ today, units: settings.units, requireFutureDate: false }).safeParse(
    formValues(formData),
  );
  if (!parsed.success) return invalid(parsed.error);
  const result = await goals.updateGoal(scope, goalId, parsed.data);
  if (!result.ok) return failure(result.message);
  revalidateGoals();
  return {
    status: "success",
    message: "Goal saved.",
    planAffected: result.value.planChanges.length > 0,
  };
}

export async function logResultAction(
  goalId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { scope, today } = await requireUserContext();
  if (!uuid.safeParse(goalId).success) return failure("Goal not found");
  const seconds = parseDuration(String(formData.get("resultTime") ?? ""));
  if (!seconds) {
    return { status: "error", fieldErrors: { resultTime: ["Enter your time like 1:43:12 or 47:55"] } };
  }
  const result = await goals.logResult(scope, goalId, seconds, today);
  if (!result.ok) return failure(result.message);
  revalidateGoals();
  const next = result.value.nextActive;
  return {
    status: "success",
    message: next ? `Result saved. “${next.name}” is now your active goal.` : "Result saved. Congratulations!",
  };
}

/** Simple goal transitions triggered by a button (no form state). */
export async function activateGoalAction(goalId: string): Promise<void> {
  const { scope } = await requireUserContext();
  if (!uuid.safeParse(goalId).success) return;
  await goals.activateGoal(scope, goalId);
  revalidateGoals();
}

export async function abandonGoalAction(goalId: string): Promise<void> {
  const { scope, today } = await requireUserContext();
  if (!uuid.safeParse(goalId).success) return;
  await goals.abandonGoal(scope, goalId, today);
  revalidateGoals();
}

export async function deleteGoalAction(goalId: string): Promise<void> {
  const { scope, today } = await requireUserContext();
  if (!uuid.safeParse(goalId).success) return;
  await goals.deleteGoal(scope, goalId, today);
  revalidateGoals();
  redirect("/goals");
}
