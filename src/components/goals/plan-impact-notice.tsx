/**
 * Shown after a change that affects the plan (date, target, availability…).
 * Phase 3 replaces the text with a "Regenerate future sessions" action.
 */
export function PlanImpactNotice() {
  return (
    <p role="status" className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
      This change affects your training plan. Future sessions can be regenerated to match — past and
      hand-edited sessions are never touched.
    </p>
  );
}
