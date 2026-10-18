"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserContext } from "@/server/context";
import { createImportToken } from "@/services/import-tokens";
import { failure, formValues, invalid, type FormState } from "./form-state";

export async function createImportTokenAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await requireUserContext();
  const parsed = z
    .object({ name: z.string().trim().min(1, "Name the device, e.g. “Marco’s iPhone”").max(60) })
    .safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { token } = await createImportToken(scope, parsed.data.name);
  revalidatePath("/settings");
  return { status: "success", message: "Token created. Copy it now — it won't be shown again.", secret: token };
}

export async function revokeImportTokenAction(tokenId: string): Promise<FormState> {
  const { scope } = await requireUserContext();
  if (!z.uuid().safeParse(tokenId).success) return failure("Token not found");
  const revoked = await scope.importTokens.revoke(tokenId);
  revalidatePath("/settings");
  return revoked ? { status: "success", message: "Token revoked." } : failure("Token not found");
}
