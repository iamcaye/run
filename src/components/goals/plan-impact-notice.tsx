import Link from "next/link";

/** Shown after a change that affects the active goal's plan (date, target, availability…). */
export function PlanImpactNotice() {
  return (
    <div role="status" className="flex flex-col gap-1 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
      <p>This change affects your training plan. Past and hand-edited sessions are never touched.</p>
      <Link href="/plan#regenerate" className="font-medium text-accent">
        Review and regenerate future sessions →
      </Link>
    </div>
  );
}
