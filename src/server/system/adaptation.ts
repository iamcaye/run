import "server-only";
import { and, eq, gte, min } from "drizzle-orm";
import type { LocalDate } from "@/lib/time";
import { db } from "@/server/db/client";
import { goal, planAdjustmentRun, plannedSession, userSettings } from "@/server/db/schema";

/**
 * Cross-tenant by necessity: the cron job has to find whose week just closed. Returns only what
 * the scheduler needs; all real work then runs per user through `forUser(userId)`.
 */
export type ActiveGoalOwner = {
  userId: string;
  goalId: string;
  raceDate: LocalDate;
  planStart: LocalDate | null;
  timezone: string;
  weekStart: number;
};

export async function listActiveGoalOwners(): Promise<ActiveGoalOwner[]> {
  return db()
    .select({
      userId: goal.userId,
      goalId: goal.id,
      raceDate: goal.raceDate,
      planStart: min(plannedSession.date),
      timezone: userSettings.timezone,
      weekStart: userSettings.weekStart,
    })
    .from(goal)
    .innerJoin(userSettings, eq(userSettings.userId, goal.userId))
    .leftJoin(plannedSession, eq(plannedSession.goalId, goal.id))
    .where(eq(goal.status, "active"))
    .groupBy(goal.userId, goal.id, goal.raceDate, userSettings.timezone, userSettings.weekStart);
}

/** Completed runs since `since`, keyed `${userId}|${goalId}|${weekStart}`. */
export async function doneRunKeys(since: LocalDate): Promise<Set<string>> {
  const rows = await db()
    .select({ userId: planAdjustmentRun.userId, goalId: planAdjustmentRun.goalId, weekStart: planAdjustmentRun.weekStart })
    .from(planAdjustmentRun)
    .where(and(eq(planAdjustmentRun.status, "done"), gte(planAdjustmentRun.weekStart, since)));
  return new Set(rows.map((r) => `${r.userId}|${r.goalId}|${r.weekStart}`));
}
