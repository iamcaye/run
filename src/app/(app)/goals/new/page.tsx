import { emptyGoalDefaults, GoalForm } from "@/components/goals/goal-form";
import { Card } from "@/components/ui/form";
import { addDays } from "@/lib/time";
import { createGoalAction } from "@/server/actions/goals";
import { requireUserContext } from "@/server/context";

export const metadata = { title: "New goal · Race Training" };

export default async function NewGoalPage() {
  const { scope, settings, today } = await requireUserContext();
  const hasActive = (await scope.goals.getActive()) !== null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">New goal</h1>
      <Card>
        <GoalForm
          action={createGoalAction}
          defaults={emptyGoalDefaults}
          units={settings.units}
          minDate={addDays(today, 1)}
          submitLabel="Create goal"
          showMakeActive={hasActive}
        />
      </Card>
    </div>
  );
}
