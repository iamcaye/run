import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { goal, importToken, plannedSession, rawImport } from "@/server/db/schema";

export class NotOwnedError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotOwnedError";
  }
}

/**
 * Foreign keys alone don't stop user B from pointing a row at user A's goal/session/token,
 * so every write that references another user-owned row checks ownership first.
 */
export async function assertOwnsGoal(d: Db, userId: string, goalId: string): Promise<void> {
  const [row] = await d
    .select({ id: goal.id })
    .from(goal)
    .where(and(eq(goal.id, goalId), eq(goal.userId, userId)));
  if (!row) throw new NotOwnedError("Goal");
}

export async function assertOwnsSession(d: Db, userId: string, sessionId: string): Promise<void> {
  const [row] = await d
    .select({ id: plannedSession.id })
    .from(plannedSession)
    .where(and(eq(plannedSession.id, sessionId), eq(plannedSession.userId, userId)));
  if (!row) throw new NotOwnedError("Planned session");
}

export async function assertOwnsToken(d: Db, userId: string, tokenId: string): Promise<void> {
  const [row] = await d
    .select({ id: importToken.id })
    .from(importToken)
    .where(and(eq(importToken.id, tokenId), eq(importToken.userId, userId)));
  if (!row) throw new NotOwnedError("Import token");
}

export async function assertOwnsRawImport(d: Db, userId: string, id: string): Promise<void> {
  const [row] = await d
    .select({ id: rawImport.id })
    .from(rawImport)
    .where(and(eq(rawImport.id, id), eq(rawImport.userId, userId)));
  if (!row) throw new NotOwnedError("Raw import");
}
