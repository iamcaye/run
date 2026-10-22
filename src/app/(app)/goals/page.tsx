import Link from "next/link";
import { GoalFacts, StatusBadge } from "@/components/goals/goal-summary";
import { Card, SubmitButton } from "@/components/ui/form";
import { canActivate, needsResultPrompt } from "@/lib/goals/rules";
import { activateGoalAction } from "@/server/actions/goals";
import { requireUserContext } from "@/server/context";
import type { Goal } from "@/server/dal";

export const metadata = { title: "Goals · Race Training" };

export default async function GoalsPage() {
  const { scope, settings, today } = await requireUserContext();
  const [goals, follow] = await Promise.all([scope.goals.list(), scope.planFollows.getActive()]);

  const current = goals
    .filter((g) => g.status === "active" || g.status === "upcoming")
    .sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : a.raceDate.localeCompare(b.raceDate)));
  const history = goals.filter((g) => g.status === "completed" || g.status === "abandoned");

  const row = (goal: Goal) => (
    <li key={goal.id} className="flex flex-col gap-2 border-b border-border py-3 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <Link href={`/goals/${goal.id}`} className="font-condensed text-2xl leading-tight font-bold uppercase hover:text-accent">
          {goal.name}
        </Link>
        <StatusBadge status={goal.status} />
      </div>
      <GoalFacts goal={goal} units={settings.units} today={today} />
      {needsResultPrompt(goal, today) ? (
        <Link href={`/goals/${goal.id}#result`} className="text-sm font-medium text-accent">
          How did the race go? Log your result →
        </Link>
      ) : canActivate(goal) ? (
        <form action={activateGoalAction.bind(null, goal.id)}>
          <SubmitButton variant="secondary" className="px-3 py-1.5 text-sm" pendingLabel="Switching…">
            Make active
          </SubmitButton>
        </form>
      ) : null}
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">Goals</h1>
        <Link href="/goals/new" className="rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground">
          New goal
        </Link>
      </div>
      {follow ? (
        <p role="status" className="rounded-xl border border-border bg-surface p-3 text-sm">
          You&apos;re following <strong>{follow.planName}</strong>. Activating a goal will stop it.
        </p>
      ) : null}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
        <Card title="Current">
          {current.length ? <ul>{current.map(row)}</ul> : <p className="text-sm text-muted">No upcoming goals. Create one to get a plan.</p>}
        </Card>
        {history.length ? (
          <Card title="History">
            <ul>{history.map(row)}</ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
