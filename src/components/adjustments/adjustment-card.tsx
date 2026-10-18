"use client";

import { useState, useTransition } from "react";
import { dayLabel } from "@/components/plan/session-card";
import { Button, FormError, FormSuccess } from "@/components/ui/form";
import { SESSION_LABELS } from "@/lib/planning/describe";
import { formatDistance, type Units } from "@/lib/units";
import { acceptAdjustmentAction, rejectAdjustmentAction } from "@/server/actions/adjustments";
import type { FormState } from "@/server/actions/form-state";
import type { AdjustmentView } from "@/services/adjustment-view";

const RULE_TITLES: Record<AdjustmentView["rule"], string> = {
  inactivity_gap: "Easing back in after a break",
  acwr_high: "Load spike — lighter week",
  low_compliance: "Holding this week's load",
  goal_review: "Review your goal?",
};

const STATUS_LABELS: Record<AdjustmentView["status"], string> = {
  proposed: "Pending",
  accepted: "Accepted",
  rejected: "Declined",
  superseded: "Replaced by a newer suggestion",
};

export function AdjustmentCard({ adjustment, units }: { adjustment: AdjustmentView; units: Units }) {
  const [result, setResult] = useState<FormState | null>(null);
  const [pending, start] = useTransition();
  const decided = adjustment.status !== "proposed" || result?.status === "success";
  const run = (action: (id: string) => Promise<FormState>) => start(async () => setResult(await action(adjustment.id)));

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <header className="flex items-start justify-between gap-2">
        <h3 className="font-medium">{RULE_TITLES[adjustment.rule]}</h3>
        {adjustment.status !== "proposed" ? <span className="shrink-0 text-xs text-muted">{STATUS_LABELS[adjustment.status]}</span> : null}
      </header>
      <p className="text-sm">{adjustment.reason}</p>

      {adjustment.changes.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">
            {adjustment.changes.length} session{adjustment.changes.length === 1 ? "" : "s"} affected
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {adjustment.changes.map((c) => (
              <li key={c.sessionId} className="flex gap-2 tabular-nums">
                <span className="w-20 shrink-0 text-xs text-muted">{c.date ? dayLabel(c.date) : "—"}</span>
                <span className="flex-1">
                  {SESSION_LABELS[c.beforeType]}
                  {c.afterType && c.afterType !== c.beforeType ? ` → ${SESSION_LABELS[c.afterType]}` : ""}
                </span>
                <span className="text-muted">
                  {formatDistance(c.beforeKm, units)} → {c.afterKm === null ? "removed" : formatDistance(c.afterKm, units)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!decided ? (
        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => run(acceptAdjustmentAction)}>
            {adjustment.changes.length > 0 ? "Apply changes" : "Got it"}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => run(rejectAdjustmentAction)}>
            {adjustment.changes.length > 0 ? "Keep my plan" : "Dismiss"}
          </Button>
        </div>
      ) : null}
      <FormError>{result?.status === "error" ? result.message : null}</FormError>
      <FormSuccess>{result?.status === "success" ? result.message : null}</FormSuccess>
    </article>
  );
}
