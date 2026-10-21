import "server-only";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import type { ActivityRowData } from "@/components/activities/activity-row";
import type { ActivitySummary, UserScope } from "@/server/dal";

/** Activities → list rows (local date/time in the user's zone, linked session type). */
export async function toActivityRows(scope: UserScope, activities: readonly ActivitySummary[], timeZone: string): Promise<ActivityRowData[]> {
  const sessionIds = [...new Set(activities.map((a) => a.plannedSessionId).filter((id): id is string => id !== null))];
  const sessions = await Promise.all(sessionIds.map((id) => scope.sessions.get(id)));
  const typeById = new Map(sessions.filter((s) => s !== null).map((s) => [s.id, s.type]));
  return activities.map((a) => {
    const local = new TZDate(a.startAt, timeZone);
    return {
      id: a.id,
      localDate: format(local, "yyyy-MM-dd"),
      startTime: format(local, "HH:mm"),
      km: a.km,
      seconds: a.seconds,
      avgHr: a.avgHr,
      rpe: a.rpe,
      source: a.source,
      sessionType: a.plannedSessionId ? (typeById.get(a.plannedSessionId) ?? null) : null,
    };
  });
}
