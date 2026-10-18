import "server-only";
import type { SessionType } from "@/config/training";
import type { PlanAdjustment, PlannedSession } from "@/server/dal";

export type AdjustmentChangeView = {
  sessionId: string;
  date: string | null;
  beforeType: SessionType;
  afterType: SessionType | null;
  beforeKm: number;
  afterKm: number | null;
};

export type AdjustmentView = {
  id: string;
  rule: PlanAdjustment["rule"];
  reason: string;
  status: PlanAdjustment["status"];
  runWeekStart: string;
  decidedAt: string | null;
  changes: AdjustmentChangeView[];
};

/** Serializable view of an adjustment with the dates of the sessions it touches. */
export function toAdjustmentView(adj: PlanAdjustment, sessions: readonly PlannedSession[]): AdjustmentView {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  return {
    id: adj.id,
    rule: adj.rule,
    reason: adj.reason,
    status: adj.status,
    runWeekStart: adj.runWeekStart,
    decidedAt: adj.decidedAt?.toISOString() ?? null,
    changes: adj.changes
      .map((c) => ({
        sessionId: c.sessionId,
        date: byId.get(c.sessionId)?.date ?? null,
        beforeType: c.before.type,
        afterType: c.op === "update" ? c.after.type : null,
        beforeKm: c.before.targetKm,
        afterKm: c.op === "update" ? c.after.targetKm : null,
      }))
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
  };
}
