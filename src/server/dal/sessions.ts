import "server-only";
import { and, asc, eq, gte, inArray, lte, notExists, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { activity, plannedSession } from "@/server/db/schema";
import { ownerColumns, ownerCondition } from "./owner";
import { assertOwnsGoal, assertOwnsOwner } from "./ownership";
import type { PlannedSession, PlannedSessionInput, PlannedSessionPatch, SessionOwner } from "./types";

export function sessionsRepo(d: Db, userId: string) {
  const owned = (id: string) => and(eq(plannedSession.id, id), eq(plannedSession.userId, userId));
  const ownedBy = (owner: SessionOwner) => and(eq(plannedSession.userId, userId), ownerCondition(owner));

  /** Sessions of one owner, optionally within [from, to] local dates (inclusive). */
  function listFor(owner: SessionOwner, range: { from?: string; to?: string } = {}): Promise<PlannedSession[]> {
    return d
      .select()
      .from(plannedSession)
      .where(
        and(
          ownedBy(owner),
          range.from ? gte(plannedSession.date, range.from) : undefined,
          range.to ? lte(plannedSession.date, range.to) : undefined,
        ),
      )
      .orderBy(asc(plannedSession.date));
  }

  return {
    listFor,

    /** Sessions of one goal; shorthand for `listFor({ goalId }, range)`. */
    listForGoal(goalId: string, range: { from?: string; to?: string } = {}): Promise<PlannedSession[]> {
      return listFor({ goalId }, range);
    },

    async get(id: string): Promise<PlannedSession | null> {
      const [row] = await d.select().from(plannedSession).where(owned(id));
      return row ?? null;
    },

    async createMany(goalId: string, inputs: PlannedSessionInput[]) {
      await assertOwnsGoal(d, userId, goalId);
      if (inputs.length === 0) return [];
      return d
        .insert(plannedSession)
        .values(inputs.map((i) => ({ ...i, ...ownerColumns({ goalId }), userId })))
        .returning();
    },

    /** Session ids of this owner that have a completed activity linked. */
    async linkedSessionIds(owner: SessionOwner): Promise<Set<string>> {
      const rows = await d
        .selectDistinct({ id: activity.plannedSessionId })
        .from(activity)
        .innerJoin(plannedSession, eq(plannedSession.id, activity.plannedSessionId))
        .where(and(eq(activity.userId, userId), ownedBy(owner)));
      return new Set(rows.map((r) => r.id).filter((id): id is string => id !== null));
    },

    /** Atomically deletes `deleteIds` (of this owner) and inserts `inserts` for it. */
    async replace(
      owner: SessionOwner,
      deleteIds: readonly string[],
      inserts: PlannedSessionInput[],
    ): Promise<void> {
      await assertOwnsOwner(d, userId, owner);
      await d.transaction(async (tx) => {
        if (deleteIds.length > 0) {
          await tx
            .delete(plannedSession)
            .where(and(ownedBy(owner), inArray(plannedSession.id, [...deleteIds])));
        }
        if (inserts.length > 0) {
          await tx
            .insert(plannedSession)
            .values(inserts.map((i) => ({ ...i, ...ownerColumns(owner), userId })));
        }
      });
    },

    /**
     * Deletes this owner's sessions on or after `today` that are not frozen (not user-edited,
     * no linked activity). Returns how many were deleted.
     */
    async deleteFutureUnfrozen(owner: SessionOwner, today: string): Promise<number> {
      const rows = await d
        .delete(plannedSession)
        .where(
          and(
            ownedBy(owner),
            gte(plannedSession.date, today),
            eq(plannedSession.isUserEdited, false),
            notExists(
              d
                .select({ one: sql`1` })
                .from(activity)
                .where(and(eq(activity.userId, userId), eq(activity.plannedSessionId, plannedSession.id))),
            ),
          ),
        )
        .returning({ id: plannedSession.id });
      return rows.length;
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
