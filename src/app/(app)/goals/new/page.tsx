import { emptyGoalDefaults, GoalForm } from "@/components/goals/goal-form";
import { Card } from "@/components/ui/form";
import { NarrowPage } from "@/components/ui/narrow-page";
import { addDays } from "@/lib/time";
import { createGoalAction } from "@/server/actions/goals";
import { requireUserContext } from "@/server/context";
import { getActiveTraining } from "@/services/training";

export const metadata = { title: "New goal · Race Training" };

export default async function NewGoalPage() {
  const { scope, settings, today } = await requireUserContext();
  // A followed custom plan counts too: the switch to the new goal must be explicit.
  const hasActive = (await getActiveTraining(scope)) !== null;

  return (
    <NarrowPage>
      <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">New goal</h1>
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
    </NarrowPage>
  );
}
