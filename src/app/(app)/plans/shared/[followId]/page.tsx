import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ActivateDialog } from "@/components/custom-plans/activate-dialog";
import { PlanReadOnly } from "@/components/custom-plans/plan-read-only";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { SubmitButton } from "@/components/ui/form";
import { activateFollowAction, duplicateFollowAction, stopCustomPlanAction } from "@/server/actions/custom-plans";
import { requireUserContext } from "@/server/context";
import { getActiveTraining, resolveFollowSource } from "@/services/training";

export const metadata = { title: "Shared plan · Race Training" };

export default async function SharedPlanPage({ params }: PageProps<"/plans/shared/[followId]">) {
  const { followId } = await params;
  const { scope, settings, today } = await requireUserContext();
  const follow = z.uuid().safeParse(followId).success ? await scope.planFollows.get(followId) : null;
  if (!follow) notFound();
  const [source, training] = await Promise.all([resolveFollowSource(scope, follow), getActiveTraining(scope)]);
  const isActive = follow.status === "active";

  return (
    <div className="flex flex-col gap-4">
      <Link href="/plans" className="text-sm font-medium text-accent">
        ← My plans
      </Link>
      {!source.live ? (
        <p role="status" className="rounded-xl bg-surface p-3 text-sm">
          No longer updated: the author removed this plan. Your copy and your sessions stay, and you can still activate it.
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-2">
        {isActive ? (
          <form action={stopCustomPlanAction}>
            <ConfirmSubmitButton
              variant="secondary"
              pendingLabel="Stopping…"
              confirmMessage="Stop this plan? Its upcoming sessions will be removed; past and completed ones stay."
            >
              Stop plan
            </ConfirmSubmitButton>
          </form>
        ) : (
          <ActivateDialog
            action={activateFollowAction.bind(null, follow.id)}
            today={today}
            replacesActive={training !== null}
            disabledReason={null}
          />
        )}
        <form action={duplicateFollowAction.bind(null, follow.id)} className="flex flex-col gap-1">
          <SubmitButton variant="secondary" pendingLabel="Copying…">
            Duplicate
          </SubmitButton>
          <span className="text-xs text-muted">Make an editable copy; it won&apos;t receive updates.</span>
        </form>
      </div>
      <PlanReadOnly
        name={source.planName}
        authorName={source.authorName}
        description={source.description}
        doc={source.doc}
        units={settings.units}
      />
    </div>
  );
}
