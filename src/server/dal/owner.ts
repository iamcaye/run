import { eq } from "drizzle-orm";
import { plannedSession } from "@/server/db/schema";
import type { PlannedSession, SessionOwner } from "./types";

/** The goal or follow a session belongs to (exactly one is set; enforced by a DB check). */
export function ownerOf(s: Pick<PlannedSession, "goalId" | "followId">): SessionOwner {
  if (s.goalId) return { goalId: s.goalId };
  if (s.followId) return { followId: s.followId };
  throw new Error("Planned session has no owner");
}

/** SQL condition matching sessions of `owner` (callers still scope by user). */
export function ownerCondition(owner: SessionOwner) {
  return "goalId" in owner
    ? eq(plannedSession.goalId, owner.goalId)
    : eq(plannedSession.followId, owner.followId);
}

/** Owner columns for inserts: the given owner set, the other explicitly null. */
export function ownerColumns(owner: SessionOwner): { goalId: string | null; followId: string | null } {
  return "goalId" in owner
    ? { goalId: owner.goalId, followId: null }
    : { goalId: null, followId: owner.followId };
}
