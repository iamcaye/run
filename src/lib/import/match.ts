import type { LocalDate } from "@/lib/time";

export type MatchCandidate = { id: string; date: LocalDate; type: string; targetKm: number };

/**
 * Picks the active goal's planned session an activity belongs to: same local date, not a rest
 * day, not already claimed by another activity; if several qualify, the closest target distance.
 */
export function matchSession(
  activity: { localDate: LocalDate; km: number },
  sessions: readonly MatchCandidate[],
  claimed: ReadonlySet<string>,
): string | null {
  let best: MatchCandidate | null = null;
  for (const s of sessions) {
    if (s.date !== activity.localDate || s.type === "rest" || claimed.has(s.id)) continue;
    if (!best || Math.abs(s.targetKm - activity.km) < Math.abs(best.targetKm - activity.km)) best = s;
  }
  return best?.id ?? null;
}
