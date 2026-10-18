import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { plannedSession } from "@/server/db/schema";
import { assertOwnsGoal } from "./ownership";
import type { PlannedSession, PlannedSessionInput, PlannedSessionPatch } from "./types";

export function sessionsRepo(d: Db, userId: string) {
  const owned = (id: string) => and(eq(plannedSession.id, id), eq(plannedSession.userId, userId));

  return {
    /** Sessions of one goal, optionally within [from, to] local dates (inclusive). */
    listForGoal(
      goalId: string,
      range: { from?: string; to?: string } = {},
    ): Promise<PlannedSession[]> {
      return d
        .select()
        .from(plannedSession)
        .where(
          and(
            eq(plannedSession.userId, userId),
            eq(plannedSession.goalId, goalId),
            range.from ? gte(plannedSession.date, range.from) : undefined,
            range.to ? lte(plannedSession.date, range.to) : undefined,
          ),
        )
        .orderBy(asc(plannedSession.date));
    },

    async get(id: string): Promise<PlannedSession | null> {
      const [row] = await d.select().from(plannedSession).where(owned(id));
      return row ?? null;
    },

    async createMany(goalId: string, inputs: Omit<PlannedSessionInput, "goalId">[]) {
      await assertOwnsGoal(d, userId, goalId);
      if (inputs.length === 0) return [];
      return d
        .insert(plannedSession)
        .values(inputs.map((i) => ({ ...i, goalId, userId })))
        .returning();
    },

    async update(id: string, patch: PlannedSessionPatch): Promise<PlannedSession | null> {
      const [row] = await d.update(plannedSession).set(patch).where(owned(id)).returning();
      return row ?? null;
    },

    async delete(id: string): Promise<boolean> {
      const rows = await d
        .delete(plannedSession)
        .where(owned(id))
        .returning({ id: plannedSession.id });
      return rows.length > 0;
    },
  };
}
