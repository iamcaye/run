"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { EDITABLE_SESSION_TYPES } from "@/lib/planning/describe";
import { isLocalDate } from "@/lib/time";
import { fromDisplayDistance } from "@/lib/units";
import { requireUserContext } from "@/server/context";
import { editSession, regenerateFuture } from "@/services/plans";
import { failure, formValues, invalid, type FormState } from "./form-state";

const uuid = z.uuid();

export async function regeneratePlanAction(goalId: string, _prev: FormState): Promise<FormState> {
  const { scope, settings, today } = await requireUserContext();
  if (!uuid.safeParse(goalId).success) return failure("Goal not found");
  const goal = await scope.goals.get(goalId);
  if (!goal || goal.status !== "active") return failure("Only the active goal's plan can be regenerated");
  const plan = await regenerateFuture(scope, goal, settings, today);
  revalidatePath("/plan");
  revalidatePath("/dashboard");
  return {
    status: "success",
    message: `Regenerated ${plan.sessions.length} future session${plan.sessions.length === 1 ? "" : "s"}. Past and edited sessions were kept.`,
  };
}

export async function editSessionAction(sessionId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { scope, settings, today } = await requireUserContext();
  if (!uuid.safeParse(sessionId).success) return failure("Session not found");
  const parsed = z
    .object({
      date: z.string().refine(isLocalDate, "Pick a valid date"),
      type: z.enum(EDITABLE_SESSION_TYPES),
      distance: z.coerce.number().min(0, "Can't be negative").max(100),
      effortDescription: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(500).nullable()),
    })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);

  const { date, type, distance, effortDescription } = parsed.data;
  const targetKm = type === "rest" ? 0 : Math.round(fromDisplayDistance(distance, settings.units) * 10) / 10;
  const result = await editSession(scope, sessionId, { date, type, targetKm, effortDescription }, settings, today);
  if (!result.ok) return failure(result.message);
  revalidatePath("/plan");
  revalidatePath("/dashboard");
  redirect(`/plan#${result.session.date}`);
}
