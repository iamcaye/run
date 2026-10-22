import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PlanReadOnly } from "@/components/custom-plans/plan-read-only";
import { requireUserContext } from "@/server/context";

export const metadata = { title: "Plan preview · Race Training" };

export default async function PlanPreviewPage({ params }: PageProps<"/plans/[id]/preview">) {
  const { id } = await params;
  const { scope, settings } = await requireUserContext();
  const plan = z.uuid().safeParse(id).success ? await scope.customPlans.get(id) : null;
  if (!plan) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={`/plans/${plan.id}`} className="text-sm font-medium text-accent">
          ← Back to builder
        </Link>
        <p className="text-sm text-muted">This is what people with the link see.</p>
      </div>
      <PlanReadOnly name={plan.name} description={plan.description} doc={plan.doc} units={settings.units} />
    </div>
  );
}
