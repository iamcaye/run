"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/config/env";
import { emptyWeek } from "@/lib/custom-plans/ops";
import { isShareToken, sharePath } from "@/lib/custom-plans/share";
import type { CustomPlanDoc } from "@/lib/custom-plans/types";
import { isLocalDate, type LocalDate } from "@/lib/time";
import { planMetaSchema, savePlanInputSchema } from "@/lib/validation/custom-plan";
import { requireUserContext } from "@/server/context";
import type { CustomPlan, UserScope } from "@/server/dal";
import { followSharedPlan, updatePlanShare } from "@/services/sharing";
import { activateCustomPlan, ownPlanSource, stopCustomPlan, syncFollowSessions } from "@/services/training";
import { failure, formValues, invalid, type FormState } from "./form-state";

const uuid = z.uuid();

export type SavePlanResult =
  | { status: "saved"; version: number }
  /** The plan is saved, but the followed plan's sessions couldn't be brought in line (retry with `retryPlanSyncAction`). */
  | { status: "saved_not_synced"; version: number }
  | { status: "conflict" }
  | { status: "error"; message: string };

export type SyncPlanResult = { status: "synced" } | { status: "error"; message: string };

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
  // Typed for callers; checked as untrusted input (it may be anything over the wire).
  input: { name: string; description: string | null; doc: CustomPlanDoc; version: number },
): Promise<SavePlanResult> {
  const { scope, today } = await requireUserContext();
  if (!uuid.safeParse(id).success) return { status: "error", message: "Plan not found" };
  const parsed = savePlanInputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: saveErrorMessage(parsed.error) };
  const { version, ...values } = parsed.data;

  const saved = await scope.customPlans.save(id, values, version);
  if (saved === "conflict") return { status: "conflict" };
  if (!saved) return { status: "error", message: "Plan not found" };

  revalidatePath("/plans");
  const synced = await syncIfFollowed(scope, id, today, saved);
  return synced === false ? { status: "saved_not_synced", version: saved.version } : { status: "saved", version: saved.version };
}

/** Re-runs the session sync of a saved plan that is being followed (after `saved_not_synced`). */
export async function retryPlanSyncAction(id: string): Promise<SyncPlanResult> {
  const { scope, today } = await requireUserContext();
  if (!uuid.safeParse(id).success) return { status: "error", message: "Plan not found" };
  const synced = await syncIfFollowed(scope, id, today);
  return synced === false ? { status: "error", message: "Your upcoming sessions still couldn't be updated. Try again later." } : { status: "synced" };
}

/**
 * Syncs the plan's active follow (if any) to `saved`, or to the stored plan. Null when there was
 * nothing to sync, false when the sync failed; the saved plan stays as is either way.
 */
async function syncIfFollowed(scope: UserScope, id: string, today: LocalDate, saved?: CustomPlan): Promise<boolean | null> {
  const [follow, plan] = await Promise.all([scope.planFollows.getForPlan(id), saved ?? scope.customPlans.get(id)]);
  if (follow?.status !== "active" || !plan) return null;
  try {
    if ((await syncFollowSessions(scope, follow, ownPlanSource(plan), today)) === "inactive") return null;
  } catch (err) {
    console.error("custom plan sync failed", err);
    return false;
  }
  revalidateTraining();
  return true;
}

function saveErrorMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  const field = issue?.path[0];
  if (field === "doc") return "Some workouts are invalid. Check them and try again.";
  if (field === "name" || field === "description") return issue?.message ?? "Check the plan's name";
  return "Reload the page and try again.";
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

export type ShareActionResult =
  | { status: "ok"; shareUrl: string | null; enabled: boolean }
  | { status: "error"; message: string };

export async function updatePlanShareAction(id: string, op: "enable" | "disable" | "regenerate"): Promise<ShareActionResult> {
  const { scope } = await requireUserContext();
  if (!uuid.safeParse(id).success || !z.enum(["enable", "disable", "regenerate"]).safeParse(op).success) {
    return { status: "error", message: "Plan not found" };
  }
  const share = await updatePlanShare(scope, id, op);
  if (!share) return { status: "error", message: "Plan not found" };
  revalidatePath(`/plans/${id}`);
  return { status: "ok", shareUrl: share.shareToken ? `${env().BETTER_AUTH_URL}${sharePath(share.shareToken)}` : null, enabled: share.shareEnabled };
}

/** Follows the plan behind a share link; activates it now or just adds it to My plans. */
export async function followSharedPlanAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { scope, today } = await requireUserContext();
  if (!isShareToken(token)) return failure("This link is no longer active.");
  const parsed = z
    .object({ startDate: z.string().refine(isLocalDate, "Pick a valid date").optional() })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const activate = formData.get("activate") === "on";

  const result = await followSharedPlan(scope, token, { activate, startDate: parsed.data.startDate ?? today }, today);
  if (!result.ok) return failure(result.code === "inactive" ? "This link is no longer active." : result.message);
  revalidateTraining();
  revalidatePath("/plans");
  if (result.kind === "own") redirect(`/plans/${result.planId}`);
  redirect(result.activated ? "/plan" : `/plans/shared/${result.followId}`);
}
