"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PlanWorkout } from "@/lib/custom-plans/types";
import { planWorkoutSchema } from "@/lib/validation/custom-plan";
import { requireUserContext } from "@/server/context";
import { failure, invalid, type FormState } from "./form-state";

const uuid = z.uuid();

/** Creates (`id` null) or updates one of the user's saved workouts. Creating redirects to its page. */
export async function saveWorkoutAction(id: string | null, workout: PlanWorkout): Promise<FormState> {
  const { scope } = await requireUserContext();
  const parsed = planWorkoutSchema.safeParse(workout);
  if (!parsed.success) return invalid(parsed.error);

  if (id === null) {
    const created = await scope.workouts.create(parsed.data);
    revalidatePath("/workouts");
    redirect(`/workouts/${created.id}`);
  }
  if (!uuid.safeParse(id).success) return failure("Workout not found");
  const updated = await scope.workouts.update(id, parsed.data);
  if (!updated) return failure("Workout not found");
  revalidatePath("/workouts");
  return { status: "success", message: "Workout saved." };
}

export async function deleteWorkoutAction(id: string): Promise<void> {
  const { scope } = await requireUserContext();
  if (uuid.safeParse(id).success) await scope.workouts.delete(id);
  revalidatePath("/workouts");
  redirect("/workouts");
}
