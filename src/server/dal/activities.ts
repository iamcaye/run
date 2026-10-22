import "server-only";
import { and, asc, desc, eq, getTableColumns, gte, lt, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { activity, plannedSession, routePoint } from "@/server/db/schema";
import { ownerCondition } from "./owner";
import { assertOwnsRawImport, assertOwnsSession } from "./ownership";
import type { Activity, ActivityInput, ActivityPatch, ActivitySummary, RoutePoint, SessionOwner } from "./types";

// Lists skip the per-second HR series: it is most of each row and only the activity detail page charts it.
const { hrSeries: _hrSeries, ...summaryColumns } = getTableColumns(activity);

export function activitiesRepo(d: Db, userId: string) {
  const owned = (id: string) => and(eq(activity.id, id), eq(activity.userId, userId));

  async function checkRefs(refs: { plannedSessionId?: string | null; rawImportId?: string | null }) {
    if (refs.plannedSessionId) await assertOwnsSession(d, userId, refs.plannedSessionId);
    if (refs.rawImportId) await assertOwnsRawImport(d, userId, refs.rawImportId);
  }

  return {
    list({ limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}): Promise<ActivitySummary[]> {
      return d
        .select(summaryColumns)
        .from(activity)
        .where(eq(activity.userId, userId))
        .orderBy(desc(activity.startAt))
        .limit(limit)
        .offset(offset);
    },

    /** Activities that started at or after `since`, oldest first. */
    since(since: Date): Promise<ActivitySummary[]> {
      return d
        .select(summaryColumns)
        .from(activity)
        .where(and(eq(activity.userId, userId), gte(activity.startAt, since)))
        .orderBy(asc(activity.startAt));
    },

    /**
     * Activities from `since` or the UTC day before the owner's (goal or follow) first planned session,
     * whichever is earlier, oldest first. The plan start is resolved in SQL so callers needn't wait for
     * the sessions query first.
     */
    sinceOrPlanStart(since: Date, owner: SessionOwner): Promise<ActivitySummary[]> {
      const planStart = d
        .select({ first: sql`min(${plannedSession.date})` })
        .from(plannedSession)
        .where(and(eq(plannedSession.userId, userId), ownerCondition(owner)));
      // LEAST ignores the NULL an owner without sessions yields.
      const from = sql`least(${since.toISOString()}::timestamptz, ((${planStart})::timestamp - interval '1 day') at time zone 'UTC')`;
      return d
        .select(summaryColumns)
        .from(activity)
        .where(and(eq(activity.userId, userId), gte(activity.startAt, from)))
        .orderBy(asc(activity.startAt));
    },

    /** Activities that started in `[from, to)`, oldest first. */
    between(from: Date, to: Date): Promise<ActivitySummary[]> {
      return d
        .select(summaryColumns)
        .from(activity)
        .where(and(eq(activity.userId, userId), gte(activity.startAt, from), lt(activity.startAt, to)))
        .orderBy(asc(activity.startAt));
    },

    async get(id: string): Promise<Activity | null> {
      const [row] = await d.select().from(activity).where(owned(id));
      return row ?? null;
    },

    /**
     * Idempotent by (userId, externalId): re-imports overwrite metrics but keep user-entered
     * RPE/notes and an existing planned-session link.
     */
    async upsert(input: ActivityInput): Promise<Activity> {
      await checkRefs(input);
      const { rpe: _rpe, notes: _notes, plannedSessionId: _link, ...imported } = input;
      const [row] = await d
        .insert(activity)
        .values({ ...input, userId })
        .onConflictDoUpdate({ target: [activity.userId, activity.externalId], set: imported })
        .returning();
      if (!row) throw new Error("Failed to upsert activity");
      return row;
    },

    async update(id: string, patch: ActivityPatch): Promise<Activity | null> {
      await checkRefs(patch);
      const [row] = await d.update(activity).set(patch).where(owned(id)).returning();
      return row ?? null;
    },

    async delete(id: string): Promise<boolean> {
      const rows = await d.delete(activity).where(owned(id)).returning({ id: activity.id });
      return rows.length > 0;
    },

    routePoints(activityId: string): Promise<RoutePoint[]> {
      return d
        .select()
        .from(routePoint)
        .where(and(eq(routePoint.activityId, activityId), eq(routePoint.userId, userId)))
        .orderBy(asc(routePoint.idx));
    },

    /** Replaces the route of an owned activity. */
    async replaceRoute(
      activityId: string,
      points: Omit<RoutePoint, "userId" | "activityId">[],
    ): Promise<void> {
      await d.transaction(async (tx) => {
        const [owner] = await tx.select({ id: activity.id }).from(activity).where(owned(activityId));
        if (!owner) throw new Error("Activity not found");
        await tx.delete(routePoint).where(eq(routePoint.activityId, activityId));
        // Chunk to stay under Postgres' bind-parameter limit on long runs.
        for (let i = 0; i < points.length; i += 5000) {
          await tx
            .insert(routePoint)
            .values(points.slice(i, i + 5000).map((p) => ({ ...p, activityId, userId })));
        }
      });
    },
  };
}
