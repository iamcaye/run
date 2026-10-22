import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { customPlan } from "@/server/db/schema";
import type { CustomPlan, CustomPlanInput, CustomPlanSave } from "./types";

export function customPlansRepo(d: Db, userId: string) {
  const owned = (id: string) => and(eq(customPlan.id, id), eq(customPlan.userId, userId));

  return {
    /** Most recently edited first. */
    list(): Promise<CustomPlan[]> {
      return d
        .select()
        .from(customPlan)
        .where(eq(customPlan.userId, userId))
        .orderBy(desc(customPlan.updatedAt));
    },

    async get(id: string): Promise<CustomPlan | null> {
      const [row] = await d.select().from(customPlan).where(owned(id));
      return row ?? null;
    },

    async create(input: CustomPlanInput): Promise<CustomPlan> {
      const [row] = await d
        .insert(customPlan)
        .values({ name: input.name, description: input.description, userId })
        .returning();
      if (!row) throw new Error("Failed to create custom plan");
      return row;
    },

    /**
     * Optimistic save: writes only if the stored version is `expectedVersion`, bumping it by one.
     * Returns `"conflict"` when someone saved in between, `null` when the plan isn't ours.
     */
    async save(id: string, input: CustomPlanSave, expectedVersion: number): Promise<CustomPlan | "conflict" | null> {
      const [row] = await d
        .update(customPlan)
        .set({
          name: input.name,
          description: input.description,
          doc: input.doc,
          version: sql`${customPlan.version} + 1`,
        })
        .where(and(owned(id), eq(customPlan.version, expectedVersion)))
        .returning();
      if (row) return row;
      const [exists] = await d.select({ id: customPlan.id }).from(customPlan).where(owned(id));
      return exists ? "conflict" : null;
    },

    /** Follows of this plan keep their snapshot and sessions (`customPlanId` becomes null). */
    async delete(id: string): Promise<boolean> {
      const rows = await d.delete(customPlan).where(owned(id)).returning({ id: customPlan.id });
      return rows.length > 0;
    },
  };
}
