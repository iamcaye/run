import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { goal } from "@/server/db/schema";
import type { Goal, GoalInput, GoalPatch, GoalStatus } from "./types";

export function goalsRepo(d: Db, userId: string) {
  const owned = (id: string) => and(eq(goal.id, id), eq(goal.userId, userId));

  return {
    list(): Promise<Goal[]> {
      return d.select().from(goal).where(eq(goal.userId, userId)).orderBy(desc(goal.raceDate));
    },

    async get(id: string): Promise<Goal | null> {
      const [row] = await d.select().from(goal).where(owned(id));
      return row ?? null;
    },

    async getActive(): Promise<Goal | null> {
      const [row] = await d
        .select()
        .from(goal)
        .where(and(eq(goal.userId, userId), eq(goal.status, "active")));
      return row ?? null;
    },

    async create(input: GoalInput): Promise<Goal> {
      const [row] = await d
        .insert(goal)
        .values({ ...input, userId })
        .returning();
      if (!row) throw new Error("Failed to create goal");
      return row;
    },

    async update(id: string, patch: GoalPatch): Promise<Goal | null> {
      const [row] = await d.update(goal).set(patch).where(owned(id)).returning();
      return row ?? null;
    },

    /** For completed/abandoned/upcoming. Use `activate` to make a goal active. */
    async setStatus(
      id: string,
      status: Exclude<GoalStatus, "active">,
      resultTimeSeconds?: number | null,
    ): Promise<Goal | null> {
      const [row] = await d
        .update(goal)
        .set({ status, ...(resultTimeSeconds !== undefined ? { resultTimeSeconds } : {}) })
        .where(owned(id))
        .returning();
      return row ?? null;
    },

    /** Makes `id` the single active goal; the previously active one goes back to `upcoming`. */
    async activate(id: string): Promise<Goal | null> {
      return d.transaction(async (tx) => {
        const [target] = await tx.select({ id: goal.id }).from(goal).where(owned(id));
        if (!target) return null;
        await tx
          .update(goal)
          .set({ status: "upcoming" })
          .where(and(eq(goal.userId, userId), eq(goal.status, "active")));
        const [row] = await tx.update(goal).set({ status: "active" }).where(owned(id)).returning();
        return row ?? null;
      });
    },

    async delete(id: string): Promise<boolean> {
      const rows = await d.delete(goal).where(owned(id)).returning({ id: goal.id });
      return rows.length > 0;
    },
  };
}
