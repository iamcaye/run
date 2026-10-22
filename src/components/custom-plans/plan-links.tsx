import Link from "next/link";

/** "My plans · My workouts" — the way into the custom plan builder from /plan. */
export function PlanLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Custom plans" className={`flex items-center gap-2 text-sm font-medium ${className}`}>
      <Link href="/plans" className="text-accent">
        My plans
      </Link>
      <span aria-hidden className="text-muted">
        ·
      </span>
      <Link href="/workouts" className="text-accent">
        My workouts
      </Link>
    </nav>
  );
}
