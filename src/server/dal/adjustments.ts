import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { planAdjustment } from "@/server/db/schema";
import { assertOwnsGoal } from "./ownership";
import type { AdjustmentStatus, PlanAdjustment, PlanAdjustmentInput } from "./types";

export function adjustmentsRepo(d: Db, userId: string) {
  const owned = (id: string) => and(eq(planAdjustment.id, id), eq(planAdjustment.userId, userId));

  return {
    listForGoal(goalId: string, status?: AdjustmentStatus): Promise<PlanAdjustment[]> {
      return d
        .select()
        .from(planAdjustment)
        .where(
          and(
            eq(planAdjustment.userId, userId),
            eq(planAdjustment.goalId, goalId),
            status ? eq(planAdjustment.status, status) : undefined,
          ),
        )
        .orderBy(desc(planAdjustment.createdAt));
    },

    async get(id: string): Promise<PlanAdjustment | null> {
      const [row] = await d.select().from(planAdjustment).where(owned(id));
      return row ?? null;
    },

    async create(input: PlanAdjustmentInput): Promise<PlanAdjustment> {
      await assertOwnsGoal(d, userId, input.goalId);
      const [row] = await d
        .insert(planAdjustment)
        .values({ ...input, userId })
        .returning();
      if (!row) throw new Error("Failed to create adjustment");
      return row;
    },

    /** Only pending proposals can be decided. */
    async decide(id: string, status: "accepted" | "rejected"): Promise<PlanAdjustment | null> {
      const [row] = await d
        .update(planAdjustment)
        .set({ status, decidedAt: new Date() })
        .where(and(owned(id), eq(planAdjustment.status, "proposed")))
        .returning();
      return row ?? null;
    },
  };
}
