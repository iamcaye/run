import "server-only";
import { buildMonthGrid, gridRange, type MonthGrid, type YearMonth } from "@/lib/plan-calendar";
import { addDays, localDateOf, type IsoWeekday, type LocalDate } from "@/lib/time";
import type { PlannedSession, Settings, UserScope } from "@/server/dal";

/** Month grid with the user's activities placed on their local dates. */
export async function getPlanCalendar(
  scope: UserScope,
  settings: Settings,
  sessions: readonly PlannedSession[],
  month: YearMonth,
  today: LocalDate,
): Promise<MonthGrid> {
  const weekStart = settings.weekStart as IsoWeekday;
  const { from, to } = gridRange(month, weekStart);
  // Pad the UTC window by a day each side so any time zone's local dates are covered, then filter by local date.
  const [rows, linkedSessionIds] = await Promise.all([
    scope.activities.between(new Date(`${addDays(from, -1)}T00:00:00Z`), new Date(`${addDays(to, 2)}T00:00:00Z`)),
    sessions.length > 0 ? scope.sessions.linkedSessionIds(sessions[0].goalId) : new Set<string>(),
  ]);
  const activities = rows
    .map((a) => ({ id: a.id, localDate: localDateOf(a.startAt, settings.timezone), km: a.km, plannedSessionId: a.plannedSessionId }))
    .filter((a) => a.localDate >= from && a.localDate <= to);
  return buildMonthGrid({ month, weekStart, today, sessions, activities, linkedSessionIds });
}
