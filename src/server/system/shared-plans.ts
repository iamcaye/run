import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { SHARING } from "@/config/training";
import type { CustomPlanDoc } from "@/lib/custom-plans/types";
import type { PlanFollow } from "@/server/dal/types";
import { db } from "@/server/db/client";
import { customPlan, planFollow, user } from "@/server/db/schema";

/**
 * Cross-tenant by necessity, like `system/import-tokens.ts`: a shared plan is read by someone
 * other than its owner, and the grant is either a share token or the follower's own `plan_follow`
 * row. Every function takes that grant; nothing here returns more than the plan's public fields
 * (never the author's email or any of their other data).
 */

export type SharedPlan = {
  planId: string;
  authorId: string;
  authorName: string;
  name: string;
  description: string | null;
  doc: CustomPlanDoc;
  version: number;
};
export type FollowedPlan = Omit<SharedPlan, "planId" | "authorId">;

export function generateShareToken(): string {
  return randomBytes(SHARING.tokenBytes).toString("base64url");
}

const planColumns = {
  planId: customPlan.id,
  authorId: customPlan.userId,
  authorName: user.name,
  name: customPlan.name,
  description: customPlan.description,
  doc: customPlan.doc,
  version: customPlan.version,
};

/** Enabled links only; unknown, disabled or malformed tokens → null. */
export async function findSharedPlan(token: string): Promise<SharedPlan | null> {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const [row] = await db()
    .select(planColumns)
    .from(customPlan)
    .innerJoin(user, eq(user.id, customPlan.userId))
    .where(and(eq(customPlan.shareToken, token), eq(customPlan.shareEnabled, true)));
  return row ?? null;
}

/** Grant = a plan_follow row (followerId, planId). Ignores shareEnabled: existing followers keep access. */
export async function readFollowedPlan(followerId: string, planId: string): Promise<FollowedPlan | null> {
  const [row] = await db()
    .select({
      authorName: user.name,
      name: customPlan.name,
      description: customPlan.description,
      doc: customPlan.doc,
      version: customPlan.version,
    })
    .from(planFollow)
    .innerJoin(customPlan, eq(customPlan.id, planFollow.customPlanId))
    .innerJoin(user, eq(user.id, customPlan.userId))
    .where(and(eq(planFollow.userId, followerId), eq(planFollow.customPlanId, planId)));
  return row ?? null;
}

export type FollowFromToken =
  | { kind: "inactive" }
  | { kind: "own"; planId: string }
  | { kind: "follow"; follow: PlanFollow; created: boolean };

/** Inserts an inactive follow (snapshot = current doc, author id/name) or returns the existing one. */
export async function followFromToken(followerId: string, token: string): Promise<FollowFromToken> {
  const plan = await findSharedPlan(token);
  if (!plan) return { kind: "inactive" };
  if (plan.authorId === followerId) return { kind: "own", planId: plan.planId };

  const [inserted] = await db()
    .insert(planFollow)
    .values({
      userId: followerId,
      customPlanId: plan.planId,
      planName: plan.name,
      snapshot: plan.doc,
      authorId: plan.authorId,
      authorName: plan.authorName,
      snapshotVersion: plan.version,
      status: "inactive",
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) return { kind: "follow", follow: inserted, created: true };

  const [existing] = await db()
    .select()
    .from(planFollow)
    .where(and(eq(planFollow.userId, followerId), eq(planFollow.customPlanId, plan.planId)));
  if (!existing) return { kind: "inactive" }; // follow vanished between insert and select
  return { kind: "follow", follow: existing, created: false };
}

/** Active follows of `planId` by users other than its author. */
export async function listActiveFollowers(
  planId: string,
  authorId: string,
): Promise<{ userId: string; followId: string }[]> {
  return db()
    .select({ userId: planFollow.userId, followId: planFollow.id })
    .from(planFollow)
    .where(
      and(eq(planFollow.customPlanId, planId), eq(planFollow.status, "active"), ne(planFollow.userId, authorId)),
    );
}
