"use client";

import { useTransition } from "react";
import { dayLabel } from "@/components/plan/session-card";
import { Button } from "@/components/ui/form";
import type { PlanChange } from "@/lib/custom-plans/changes";
import { SESSION_LABELS } from "@/lib/planning/describe";
import { formatDistance, type Units } from "@/lib/units";
import { dismissPlanNoticeAction } from "@/server/actions/custom-plans";

function side(brief: PlanChange["before"], units: Units): string {
  return brief ? `${SESSION_LABELS[brief.type]} ${formatDistance(brief.km, units)}` : "";
}

function changeText(c: PlanChange, units: Units): string {
  if (!c.before) return `Added: ${side(c.after, units)}`;
  if (!c.after) return `Removed: ${side(c.before, units)}`;
  return `${side(c.before, units)} → ${side(c.after, units)}`;
}

/** "The author updated your plan" notice, in the look of an adjustment suggestion. */
export function PlanUpdateCard({
  notice,
  units,
}: {
  notice: { id: string; headline: string; changes: PlanChange[] };
  units: Units;
}) {
  const [pending, start] = useTransition();
  const n = notice.changes.length;
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <h3 className="font-medium">{notice.headline}</h3>
      {n > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">
            {n} session{n === 1 ? "" : "s"} affected
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {notice.changes.map((c) => (
              <li key={`${c.date}-${c.before ? "b" : ""}${c.after ? "a" : ""}`} className="flex gap-2 tabular-nums">
                <span className="w-20 shrink-0 text-xs text-muted">{dayLabel(c.date)}</span>
                <span className="flex-1">{changeText(c, units)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="flex gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => start(() => dismissPlanNoticeAction(notice.id))}>
          Dismiss
        </Button>
      </div>
    </article>
  );
}
