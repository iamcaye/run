import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import type { LocalDate } from "@/lib/time";
import type { CustomPlanDoc } from "@/lib/custom-plans/types";
import type { Db } from "@/server/db/client";
import { goal, planFollow } from "@/server/db/schema";
import { assertOwnsPlan } from "./ownership";
import type { CustomPlan, PlanFollow } from "./types";

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
        .values({ userId, customPlanId: plan.id, planName: plan.name, snapshot: plan.doc })
        .onConflictDoUpdate({
          target: [planFollow.userId, planFollow.customPlanId],
          targetWhere: sql`${planFollow.customPlanId} is not null`,
          set: { planName: plan.name, snapshot: plan.doc, updatedAt: new Date() },
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

    async updateSnapshot(id: string, planName: string, snapshot: CustomPlanDoc): Promise<void> {
      await d.update(planFollow).set({ planName, snapshot }).where(owned(id));
    },
  };
}
