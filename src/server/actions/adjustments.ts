"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserContext } from "@/server/context";
import { acceptAdjustment, rejectAdjustment } from "@/services/weekly-adaptation";
import { failure, type FormState } from "./form-state";

function revalidate() {
  revalidatePath("/dashboard");
  revalidatePath("/plan");
}

export async function acceptAdjustmentAction(id: string): Promise<FormState> {
  const { scope, today } = await requireUserContext();
  if (!z.uuid().safeParse(id).success) return failure("Proposal not found");
  const result = await acceptAdjustment(scope, id, today);
  if (!result) return failure("This proposal was already handled.");
  revalidate();
  const { applied, skipped } = result;
  return {
    status: "success",
    message:
      `Applied ${applied} change${applied === 1 ? "" : "s"}.` +
      (skipped > 0 ? ` ${skipped} session${skipped === 1 ? " was" : "s were"} left as is (edited, completed or already past).` : ""),
  };
}

export async function rejectAdjustmentAction(id: string): Promise<FormState> {
  const { scope } = await requireUserContext();
  if (!z.uuid().safeParse(id).success) return failure("Proposal not found");
  const result = await rejectAdjustment(scope, id);
  if (!result) return failure("This proposal was already handled.");
  revalidate();
  return { status: "success", message: "Kept your plan as it was." };
}
