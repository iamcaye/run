import type { SessionType } from "@/config/training";
import type { StructureStep } from "@/lib/planning/types";
import type { LocalDate } from "@/lib/time";

export type SessionBrief = { type: SessionType; km: number };
export type PlanChange = { date: LocalDate; week: number; before: SessionBrief | null; after: SessionBrief | null };
export type SyncedSession = {
  date: LocalDate;
  weekIndex: number;
  type: SessionType;
  targetKm: number;
  structure: { steps: StructureStep[] } | null;
};

const brief = (s: SyncedSession): SessionBrief => ({ type: s.type, km: s.targetKm });
const sameBrief = (a: SessionBrief | null, b: SessionBrief | null) =>
  a === b || (a !== null && b !== null && a.type === b.type && a.km === b.km);
const byDate = (a: PlanChange, b: PlanChange) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
const stepsKey = (s: SyncedSession) => JSON.stringify(s.structure?.steps ?? null);

/** Pairs removed and added sessions by date; drops pairs whose type, km and steps are equal. Sorted by date. */
export function sessionChanges(removed: readonly SyncedSession[], added: readonly SyncedSession[]): PlanChange[] {
  const before = new Map(removed.map((s) => [s.date, s]));
  const after = new Map(added.map((s) => [s.date, s]));
  const out: PlanChange[] = [];
  for (const date of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(date);
    const a = after.get(date);
    if (b && a && b.type === a.type && b.targetKm === a.targetKm && stepsKey(b) === stepsKey(a)) continue;
    out.push({
      date,
      week: (a ?? b)!.weekIndex + 1,
      before: b ? brief(b) : null,
      after: a ? brief(a) : null,
    });
  }
  return out.sort(byDate);
}

/** Same date: keep the oldest `before`, newest `after`; drop entries that end equal (before≈after or both null). */
export function mergeChanges(older: readonly PlanChange[], newer: readonly PlanChange[]): PlanChange[] {
  const byD = new Map<string, PlanChange>();
  for (const c of older) byD.set(c.date, c);
  for (const c of newer) {
    const prev = byD.get(c.date);
    byD.set(c.date, prev ? { ...c, before: prev.before } : c);
  }
  return [...byD.values()].filter((c) => !sameBrief(c.before, c.after)).sort(byDate);
}

export function noticeHeadline(authorName: string, changes: readonly PlanChange[]): string {
  const weeks = new Set(changes.map((c) => c.week));
  const n = changes.length;
  const noun = n === 1 ? "session" : "sessions";
  const where =
    weeks.size === 1 ? `in week ${[...weeks][0]} changed` : `changed across ${weeks.size} weeks`;
  return `${authorName} updated your plan: ${n} ${noun} ${where}`;
}
