import { notFound } from "next/navigation";
import { z } from "zod";
import { PlanBuilder } from "@/components/custom-plans/plan-builder";
import { env } from "@/config/env";
import { sharePath } from "@/lib/custom-plans/share";
import { requireUserContext } from "@/server/context";
import { getActiveTraining } from "@/services/training";

export const metadata = { title: "Plan builder · Race Training" };

export default async function PlanBuilderPage({ params }: PageProps<"/plans/[id]">) {
  const { id } = await params;
  const { scope, settings, today } = await requireUserContext();
  // Another user's plan (or a malformed id) is indistinguishable from a missing one.
  const plan = z.uuid().safeParse(id).success ? await scope.customPlans.get(id) : null;
  if (!plan) notFound();

  const [workouts, active] = await Promise.all([scope.workouts.list(), getActiveTraining(scope)]);
  const isActive = active?.kind === "plan" && active.follow.customPlanId === plan.id;

  return (
    <PlanBuilder
      plan={{ id: plan.id, name: plan.name, description: plan.description, doc: plan.doc, version: plan.version }}
      library={workouts.map(({ id, name, type, notes, steps }) => ({ id, name, type, notes, steps }))}
      units={settings.units}
      today={today}
      isActive={isActive}
      replacesActive={active !== null && !isActive}
      share={{
        shareUrl: plan.shareToken ? `${env().BETTER_AUTH_URL}${sharePath(plan.shareToken)}` : null,
        enabled: plan.shareEnabled,
      }}
    />
  );
}
