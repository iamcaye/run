import Link from "next/link";
import { redirect } from "next/navigation";
import { FollowForm } from "@/components/custom-plans/follow-form";
import { NarrowPage } from "@/components/ui/narrow-page";
import { followPath, isShareToken } from "@/lib/custom-plans/share";
import { followSharedPlanAction } from "@/server/actions/custom-plans";
import { getCurrentUser } from "@/server/auth/session";
import { requireUserContext } from "@/server/context";
import { findSharedPlan } from "@/server/system/shared-plans";
import { getActiveTraining } from "@/services/training";

export const metadata = { title: "Follow plan · Race Training" };

function Inactive() {
  return (
    <NarrowPage>
      <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">Link no longer active</h1>
      <p className="text-muted">Ask whoever shared it for a new link.</p>
    </NarrowPage>
  );
}

export default async function FollowPage({ params }: PageProps<"/p/[token]/follow">) {
  const { token } = await params;
  if (!(await getCurrentUser())) redirect(`/sign-in?next=${encodeURIComponent(followPath(token))}`);
  if (!isShareToken(token)) return <Inactive />;

  const { scope, settings, today } = await requireUserContext();
  if (!settings.onboardingCompletedAt) redirect(`/onboarding?plan=${token}`);

  const plan = await findSharedPlan(token);
  if (!plan) return <Inactive />;
  if (plan.authorId === scope.userId) redirect(`/plans/${plan.planId}`);

  const existing = await scope.planFollows.getForPlan(plan.planId);
  if (existing) {
    return (
      <NarrowPage>
        <p>You already follow this plan.</p>
        <Link href={`/plans/shared/${existing.id}`} className="font-medium text-accent">
          Open it →
        </Link>
      </NarrowPage>
    );
  }

  const active = await getActiveTraining(scope);
  return (
    <NarrowPage>
      <header className="flex flex-col gap-1">
        <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">Follow {plan.name}</h1>
        <p className="text-sm text-muted">by {plan.authorName}</p>
      </header>
      <FollowForm
        action={followSharedPlanAction.bind(null, token)}
        today={today}
        showActivate
        replacesActive={active !== null}
      />
    </NarrowPage>
  );
}
