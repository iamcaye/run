import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { IMPORT } from "@/config/training";
import { db } from "@/server/db/client";
import { importToken } from "@/server/db/schema";

/**
 * Cross-tenant by necessity: an import request carries only a token, and the token is what
 * tells us which user it belongs to. Nothing else here reads user data.
 */

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A new random token; only its hash is ever stored. */
export function generateToken(): { token: string; hash: string } {
  const token = `${IMPORT.tokenPrefix}${randomBytes(IMPORT.tokenRandomBytes).toString("base64url")}`;
  return { token, hash: hashToken(token) };
}

export type ResolvedToken = { tokenId: string; userId: string };

/** Resolves an `Authorization: Bearer …` header to an active (non-revoked) token. */
export async function resolveBearerToken(authorization: string | null): Promise<ResolvedToken | null> {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  const token = match?.[1];
  if (!token?.startsWith(IMPORT.tokenPrefix)) return null;

  const hash = hashToken(token);
  const [row] = await db()
    .select({ id: importToken.id, userId: importToken.userId, tokenHash: importToken.tokenHash, revokedAt: importToken.revokedAt })
    .from(importToken)
    .where(eq(importToken.tokenHash, hash));
  if (!row || row.revokedAt) return null;
  // The lookup is by hash already; compare again in constant time for good measure.
  if (!timingSafeEqual(Buffer.from(row.tokenHash), Buffer.from(hash))) return null;
  return { tokenId: row.id, userId: row.userId };
}

export async function touchToken(tokenId: string): Promise<void> {
  await db().update(importToken).set({ lastUsedAt: new Date() }).where(eq(importToken.id, tokenId));
}
