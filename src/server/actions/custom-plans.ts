"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { emptyWeek } from "@/lib/custom-plans/ops";
import type { CustomPlanDoc } from "@/lib/custom-plans/types";
import { isLocalDate } from "@/lib/time";
import { customPlanDocSchema, planMetaSchema } from "@/lib/validation/custom-plan";
import { requireUserContext } from "@/server/context";
import { activateCustomPlan, stopCustomPlan, syncFollowSessions } from "@/services/training";
import { failure, formValues, invalid, type FormState } from "./form-state";

const uuid = z.uuid();

export type SavePlanResult = { status: "saved"; version: number } | { status: "conflict" } | { status: "error"; message: string };

function revalidateTraining() {
  revalidatePath("/plan");
  revalidatePath("/dashboard");
}

/** Creates a plan with one empty week and opens it in the builder. */
export async function createCustomPlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await requireUserContext();
  const parsed = planMetaSchema.pick({ name: true }).safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const created = await scope.customPlans.create({ name: parsed.data.name, description: null });
  const doc: CustomPlanDoc = { weeks: [emptyWeek(() => crypto.randomUUID())] };
  await scope.customPlans.save(created.id, { name: created.name, description: null, doc }, created.version);
  revalidatePath("/plans");
  redirect(`/plans/${created.id}`);
}

/**
 * Optimistic save of the builder's state. When this plan is the one being followed, its future
 * sessions are brought in line right away.
 */
export async function saveCustomPlanAction(
  id: string,
  input: { name: string; description: string | null; doc: CustomPlanDoc; version: number },
): Promise<SavePlanResult> {
  const { scope, today } = await requireUserContext();
  if (!uuid.safeParse(id).success) return { status: "error", message: "Plan not found" };
  const meta = planMetaSchema.safeParse({ name: input.name, description: input.description });
  if (!meta.success) return { status: "error", message: meta.error.issues[0]?.message ?? "Check the plan's name" };
  const doc = customPlanDocSchema.safeParse(input.doc);
  if (!doc.success) return { status: "error", message: "Some workouts are invalid. Check them and try again." };
  if (!Number.isInteger(input.version)) return { status: "error", message: "Reload the page and try again." };

  const saved = await scope.customPlans.save(id, { ...meta.data, doc: doc.data }, input.version);
  if (saved === "conflict") return { status: "conflict" };
  if (!saved) return { status: "error", message: "Plan not found" };

  const follow = await scope.planFollows.getForPlan(id);
  if (follow?.status === "active") {
    await syncFollowSessions(scope, follow, saved.doc, today);
    revalidateTraining();
  }
  revalidatePath("/plans");
  return { status: "saved", version: saved.version };
}

/** Deletes a plan; if it is the one being followed, the follow is stopped first. */
export async function deleteCustomPlanAction(id: string): Promise<void> {
  const { scope, today } = await requireUserContext();
  if (uuid.safeParse(id).success) {
    const follow = await scope.planFollows.getForPlan(id);
    if (follow?.status === "active") {
      await stopCustomPlan(scope, today);
      revalidateTraining();
    }
    await scope.customPlans.delete(id);
  }
  revalidatePath("/plans");
  redirect("/plans");
}

export async function activateCustomPlanAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { scope, today } = await requireUserContext();
  if (!uuid.safeParse(id).success) return failure("Plan not found");
  const parsed = z
    .object({ startDate: z.string().refine(isLocalDate, "Pick a valid date") })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const result = await activateCustomPlan(scope, id, parsed.data.startDate, today);
  if (!result.ok) return failure(result.message);
  revalidateTraining();
  revalidatePath("/plans");
  redirect("/plan");
}

export async function stopCustomPlanAction(): Promise<void> {
  const { scope, today } = await requireUserContext();
  await stopCustomPlan(scope, today);
  revalidateTraining();
  revalidatePath("/plans");
}
