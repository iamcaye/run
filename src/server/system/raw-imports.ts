import "server-only";
import { db } from "@/server/db/client";
import { rawImport } from "@/server/db/schema";

/** Users that have stored payloads (for `pnpm reprocess` across all users). */
export async function listUserIdsWithRawImports(): Promise<string[]> {
  const rows = await db().selectDistinct({ userId: rawImport.userId }).from(rawImport);
  return rows.map((r) => r.userId);
}
