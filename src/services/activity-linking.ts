import "server-only";
import { matchSession } from "@/lib/import/match";
import { localDateOf } from "@/lib/time";
import type { Activity, UserScope } from "@/server/dal";
import { getActiveTraining } from "./training";

/**
 * Links an activity to the active goal's or custom plan's planned session on the same local date (closest target
 * distance, rest days and already-claimed sessions excluded). Shared by imports and manual runs.
 */
export async function linkToPlannedSession(scope: UserScope, activity: Activity, timeZone: string): Promise<boolean> {
  if (activity.plannedSessionId) return true;
  const owner = (await getActiveTraining(scope))?.owner;
  if (!owner) return false;
  const localDate = localDateOf(activity.startAt, timeZone);
  const [sessions, claimed] = await Promise.all([
    scope.sessions.listFor(owner, { from: localDate, to: localDate }),
    scope.sessions.linkedSessionIds(owner),
  ]);
  const sessionId = matchSession({ localDate, km: activity.km }, sessions, claimed);
  if (!sessionId) return false;
  await scope.activities.update(activity.id, { plannedSessionId: sessionId });
  return true;
}
