import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { planUpdateNotice } from "@/server/db/schema";
import type { PlanNotice } from "./types";

export function planNoticesRepo(d: Db, userId: string) {
  return {
    /** Undismissed notices, newest first. */
    listOpen(): Promise<PlanNotice[]> {
      return d
        .select()
        .from(planUpdateNotice)
        .where(and(eq(planUpdateNotice.userId, userId), isNull(planUpdateNotice.dismissedAt)))
        .orderBy(desc(planUpdateNotice.updatedAt));
    },

    async dismiss(id: string): Promise<boolean> {
      const rows = await d
        .update(planUpdateNotice)
        .set({ dismissedAt: new Date() })
        .where(and(eq(planUpdateNotice.id, id), eq(planUpdateNotice.userId, userId), isNull(planUpdateNotice.dismissedAt)))
        .returning({ id: planUpdateNotice.id });
      return rows.length > 0;
    },
  };
}
