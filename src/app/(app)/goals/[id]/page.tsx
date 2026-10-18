import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { goalToFormDefaults } from "@/components/goals/goal-defaults";
import { GoalForm } from "@/components/goals/goal-form";
import { GoalFacts, StatusBadge } from "@/components/goals/goal-summary";
import { ResultForm } from "@/components/goals/result-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { Card, SubmitButton } from "@/components/ui/form";
import { canAbandon, canActivate, canLogResult } from "@/lib/goals/rules";
import {
  abandonGoalAction,
  activateGoalAction,
  deleteGoalAction,
  logResultAction,
  updateGoalAction,
} from "@/server/actions/goals";
import { requireUserContext } from "@/server/context";

export const metadata = { title: "Goal · Race Training" };

export default async function GoalPage({ params }: PageProps<"/goals/[id]">) {
  const { id } = await params;
  const { scope, settings, today } = await requireUserContext();
  // Another user's goal (or a malformed id) is indistinguishable from a missing one.
  const goal = z.uuid().safeParse(id).success ? await scope.goals.get(id) : null;
  if (!goal) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/goals" className="text-sm text-muted">
        ← Goals
      </Link>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{goal.name}</h1>
          <GoalFacts goal={goal} units={settings.units} today={today} />
        </div>
        <StatusBadge status={goal.status} />
      </div>

      {canLogResult(goal, today) ? (
        <Card title="Log your result">
          <div id="result" className="-mt-2" />
          <ResultForm action={logResultAction.bind(null, goal.id)} />
        </Card>
      ) : null}

      <Card title="Edit goal">
        <GoalForm
          action={updateGoalAction.bind(null, goal.id)}
          defaults={goalToFormDefaults(goal, settings.units)}
          units={settings.units}
          submitLabel="Save changes"
        />
      </Card>

      <Card title="Status">
        <div className="flex flex-wrap gap-2">
          {canActivate(goal) ? (
            <form action={activateGoalAction.bind(null, goal.id)}>
              <SubmitButton pendingLabel="Switching…">Make active</SubmitButton>
            </form>
          ) : null}
          {canAbandon(goal) ? (
            <form action={abandonGoalAction.bind(null, goal.id)}>
              <ConfirmSubmitButton variant="secondary" confirmMessage="Abandon this goal? Its history is kept.">
                Abandon
              </ConfirmSubmitButton>
            </form>
          ) : null}
          <form action={deleteGoalAction.bind(null, goal.id)}>
            <ConfirmSubmitButton
              variant="secondary"
              className="text-danger"
              confirmMessage="Delete this goal and its plan permanently?"
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>
      </Card>
    </div>
  );
}
