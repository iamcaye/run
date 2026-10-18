import "server-only";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { AdjustableSessionFields, AdjustmentChange } from "@/lib/planning/types";
import type { LocalDate } from "@/lib/time";
import type { Db } from "@/server/db/client";
import { activity, planAdjustment, planAdjustmentRun, plannedSession } from "@/server/db/schema";
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

    /** Older pending proposals are retired when a new weekly run produces fresh ones. */
    async supersedePending(goalId: string): Promise<number> {
      const rows = await d
        .update(planAdjustment)
        .set({ status: "superseded", decidedAt: new Date() })
        .where(and(eq(planAdjustment.userId, userId), eq(planAdjustment.goalId, goalId), eq(planAdjustment.status, "proposed")))
        .returning({ id: planAdjustment.id });
      return rows.length;
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

    /**
     * Accepts a proposal atomically: each change is applied only if its session still matches
     * `before`, is still in the future, isn't user-edited and has no linked run; others are skipped.
     */
    async accept(id: string, today: LocalDate): Promise<{ adjustment: PlanAdjustment; applied: number; skipped: number } | null> {
      return d.transaction(async (tx) => {
        const [adj] = await tx
          .select()
          .from(planAdjustment)
          .where(and(owned(id), eq(planAdjustment.status, "proposed")))
          .for("update");
        if (!adj) return null;

        const ids = adj.changes.map((c) => c.sessionId);
        const current = ids.length
          ? await tx
              .select()
              .from(plannedSession)
              .where(and(eq(plannedSession.userId, userId), eq(plannedSession.goalId, adj.goalId), inArray(plannedSession.id, ids)))
          : [];
        const linked = ids.length
          ? new Set(
              (
                await tx
                  .select({ id: activity.plannedSessionId })
                  .from(activity)
                  .where(and(eq(activity.userId, userId), inArray(activity.plannedSessionId, ids)))
              ).map((r) => r.id),
            )
          : new Set<string | null>();
        const byId = new Map(current.map((s) => [s.id, s]));

        let applied = 0;
        for (const change of adj.changes as AdjustmentChange[]) {
          const s = byId.get(change.sessionId);
          const unchanged =
            s &&
            !s.isUserEdited &&
            s.date >= today &&
            !linked.has(s.id) &&
            sameFields(
              { type: s.type, targetKm: s.targetKm, targetPaceSecPerKm: s.targetPaceSecPerKm, effortDescription: s.effortDescription, structure: s.structure },
              change.before,
            );
          if (!unchanged) continue;
          if (change.op === "delete") {
            await tx.delete(plannedSession).where(and(eq(plannedSession.id, change.sessionId), eq(plannedSession.userId, userId)));
          } else {
            await tx
              .update(plannedSession)
              .set(change.after)
              .where(and(eq(plannedSession.id, change.sessionId), eq(plannedSession.userId, userId)));
          }
          applied++;
        }
        const [decided] = await tx
          .update(planAdjustment)
          .set({ status: "accepted", decidedAt: new Date() })
          .where(owned(id))
          .returning();
        if (!decided) return null;
        return { adjustment: decided, applied, skipped: adj.changes.length - applied };
      });
    },
  };
}

export function adjustmentRunsRepo(d: Db, userId: string) {
  const key = (goalId: string, weekStart: LocalDate) =>
    and(eq(planAdjustmentRun.userId, userId), eq(planAdjustmentRun.goalId, goalId), eq(planAdjustmentRun.weekStart, weekStart));

  return {
    /**
     * Claims the weekly run for (goal, week). Succeeds for a new row, or to retry a failed run or
     * one stuck in `running` longer than `staleMinutes`. Returns false if someone else has it.
     */
    async claim(goalId: string, weekStart: LocalDate, staleMinutes: number): Promise<boolean> {
      await assertOwnsGoal(d, userId, goalId);
      const staleBefore = new Date(Date.now() - staleMinutes * 60_000);
      const rows = await d
        .insert(planAdjustmentRun)
        .values({ userId, goalId, weekStart, status: "running" })
        .onConflictDoUpdate({
          target: [planAdjustmentRun.userId, planAdjustmentRun.goalId, planAdjustmentRun.weekStart],
          set: { status: "running", startedAt: sql`now()`, finishedAt: null, error: null },
          setWhere: or(
            eq(planAdjustmentRun.status, "failed"),
            and(eq(planAdjustmentRun.status, "running"), lt(planAdjustmentRun.startedAt, staleBefore)),
          ),
        })
        .returning({ status: planAdjustmentRun.status });
      return rows.length > 0;
    },

    async finish(goalId: string, weekStart: LocalDate, result: { status: "done" | "failed"; error?: string }): Promise<void> {
      await d
        .update(planAdjustmentRun)
        .set({ status: result.status, error: result.error ?? null, finishedAt: new Date() })
        .where(key(goalId, weekStart));
    },

    async get(goalId: string, weekStart: LocalDate) {
      const [row] = await d.select().from(planAdjustmentRun).where(key(goalId, weekStart));
      return row ?? null;
    },
  };
}

function sameFields(a: AdjustableSessionFields, b: AdjustableSessionFields): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/** jsonb doesn't preserve key order, so compare structurally. */
function normalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, normalize(x)]),
    );
  }
  return v;
}
