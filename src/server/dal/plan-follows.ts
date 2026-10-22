import "server-only";
import { and, desc, eq, inArray, isNull, ne, notExists, sql } from "drizzle-orm";
import type { LocalDate } from "@/lib/time";
import type { CustomPlanDoc } from "@/lib/custom-plans/types";
import type { Db } from "@/server/db/client";
import { mergeChanges, type PlanChange } from "@/lib/custom-plans/changes";
import { activity, goal, planFollow, planUpdateNotice, plannedSession } from "@/server/db/schema";
import { ownerColumns } from "./owner";
import { assertOwnsFollow, assertOwnsPlan } from "./ownership";
import type { CustomPlan, PlanFollow, PlannedSessionInput } from "./types";

export function planFollowsRepo(d: Db, userId: string) {
  const owned = (id: string) => and(eq(planFollow.id, id), eq(planFollow.userId, userId));

  return {
    async getActive(): Promise<PlanFollow | null> {
      const [row] = await d
        .select()
        .from(planFollow)
        .where(and(eq(planFollow.userId, userId), eq(planFollow.status, "active")));
      return row ?? null;
    },

    async get(id: string): Promise<PlanFollow | null> {
      const [row] = await d.select().from(planFollow).where(owned(id));
      return row ?? null;
    },

    async getForPlan(customPlanId: string): Promise<PlanFollow | null> {
      const [row] = await d
        .select()
        .from(planFollow)
        .where(and(eq(planFollow.userId, userId), eq(planFollow.customPlanId, customPlanId)));
      return row ?? null;
    },

    /** The follow of `plan` (one per plan), created inactive or refreshed with the plan's name and doc. */
    async upsertForPlan(plan: CustomPlan): Promise<PlanFollow> {
      await assertOwnsPlan(d, userId, plan.id);
      const [row] = await d
        .insert(planFollow)
        .values({ userId, customPlanId: plan.id, planName: plan.name, snapshot: plan.doc, authorId: userId })
        .onConflictDoUpdate({
          target: [planFollow.userId, planFollow.customPlanId],
          targetWhere: sql`${planFollow.customPlanId} is not null`,
          set: { planName: plan.name, snapshot: plan.doc, authorId: userId, updatedAt: new Date() },
        })
        .returning();
      if (!row) throw new Error("Failed to upsert plan follow");
      return row;
    },

    /**
     * Makes `id` the user's single active plan from `startDate`. In one transaction the active goal
     * goes back to `upcoming` and any other active follow becomes `inactive`.
     */
    async activate(id: string, startDate: LocalDate): Promise<PlanFollow | null> {
      return d.transaction(async (tx) => {
        const [target] = await tx.select({ id: planFollow.id }).from(planFollow).where(owned(id));
        if (!target) return null;
        await tx
          .update(goal)
          .set({ status: "upcoming" })
          .where(and(eq(goal.userId, userId), eq(goal.status, "active")));
        await tx
          .update(planFollow)
          .set({ status: "inactive" })
          .where(and(eq(planFollow.userId, userId), eq(planFollow.status, "active"), ne(planFollow.id, id)));
        const [row] = await tx
          .update(planFollow)
          .set({ status: "active", startDate })
          .where(owned(id))
          .returning();
        return row ?? null;
      });
    },

    async deactivate(id: string): Promise<PlanFollow | null> {
      const [row] = await d.update(planFollow).set({ status: "inactive" }).where(owned(id)).returning();
      return row ?? null;
    },

    /** Follows whose author is not this user (incl. detached ones), newest first. */
    async listShared(): Promise<PlanFollow[]> {
      return d
        .select()
        .from(planFollow)
        .where(
          and(
            eq(planFollow.userId, userId),
            sql`${planFollow.authorId} is distinct from ${userId}`,
          ),
        )
        .orderBy(desc(planFollow.createdAt));
    },

    /**
     * One transaction: bumps the follow's sync sequence (only if it is still `expectedSeq`),
     * stores the new snapshot, replaces the sessions and merges `notice` into the open notice.
     * Returns "stale" (and writes nothing) when another sync got there first.
     */
    async applySync(
      followId: string,
      input: {
        expectedSeq: number;
        snapshotVersion: number;
        planName: string;
        authorName: string | null;
        snapshot: CustomPlanDoc;
        deleteIds: readonly string[];
        inserts: PlannedSessionInput[];
        notice: { authorName: string; changes: PlanChange[] } | null;
      },
    ): Promise<"applied" | "stale"> {
      await assertOwnsFollow(d, userId, followId);
      return d.transaction(async (tx) => {
        const [row] = await tx
          .update(planFollow)
          .set({
            syncSeq: sql`${planFollow.syncSeq} + 1`,
            snapshotVersion: input.snapshotVersion,
            planName: input.planName,
            snapshot: input.snapshot,
            authorName: input.authorName,
          })
          .where(and(owned(followId), eq(planFollow.syncSeq, input.expectedSeq)))
          .returning({ id: planFollow.id });
        if (!row) return "stale";

        if (input.deleteIds.length > 0) {
          await tx
            .delete(plannedSession)
            .where(
              and(
                eq(plannedSession.userId, userId),
                eq(plannedSession.followId, followId),
                inArray(plannedSession.id, [...input.deleteIds]),
                // Re-check frozenness: a session may have been edited or linked since the diff was computed.
                eq(plannedSession.isUserEdited, false),
                notExists(
                  tx
                    .select({ one: sql`1` })
                    .from(activity)
                    .where(and(eq(activity.userId, userId), eq(activity.plannedSessionId, plannedSession.id))),
                ),
              ),
            );
        }
        if (input.inserts.length > 0) {
          await tx
            .insert(plannedSession)
            .values(input.inserts.map((i) => ({ ...i, ...ownerColumns({ followId }), userId })));
        }

        if (input.notice) {
          const [open] = await tx
            .select()
            .from(planUpdateNotice)
            .where(and(eq(planUpdateNotice.followId, followId), isNull(planUpdateNotice.dismissedAt)))
            .for("update");
          if (!open) {
            if (input.notice.changes.length > 0) {
              await tx.insert(planUpdateNotice).values({
                userId,
                followId,
                authorName: input.notice.authorName,
                changes: input.notice.changes,
              });
            }
          } else {
            const merged = mergeChanges(open.changes, input.notice.changes);
            if (merged.length === 0) {
              await tx.delete(planUpdateNotice).where(eq(planUpdateNotice.id, open.id));
            } else {
              await tx
                .update(planUpdateNotice)
                .set({ changes: merged, authorName: input.notice.authorName })
                .where(eq(planUpdateNotice.id, open.id));
            }
          }
        }
        return "applied";
      });
    },
  };
}
