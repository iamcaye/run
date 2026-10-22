import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { customPlan, goal, importToken, planFollow, plannedSession, rawImport } from "@/server/db/schema";
import type { SessionOwner } from "./types";

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

export async function assertOwnsFollow(d: Db, userId: string, followId: string): Promise<void> {
  const [row] = await d
    .select({ id: planFollow.id })
    .from(planFollow)
    .where(and(eq(planFollow.id, followId), eq(planFollow.userId, userId)));
  if (!row) throw new NotOwnedError("Plan follow");
}

export async function assertOwnsPlan(d: Db, userId: string, planId: string): Promise<void> {
  const [row] = await d
    .select({ id: customPlan.id })
    .from(customPlan)
    .where(and(eq(customPlan.id, planId), eq(customPlan.userId, userId)));
  if (!row) throw new NotOwnedError("Custom plan");
}

export function assertOwnsOwner(d: Db, userId: string, owner: SessionOwner): Promise<void> {
  return "goalId" in owner
    ? assertOwnsGoal(d, userId, owner.goalId)
    : assertOwnsFollow(d, userId, owner.followId);
}
