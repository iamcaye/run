import type { Metadata } from "next";
import Link from "next/link";
import { PlanReadOnly } from "@/components/custom-plans/plan-read-only";
import { NarrowPage } from "@/components/ui/narrow-page";
import { followPath, isShareToken } from "@/lib/custom-plans/share";
import { getCurrentUser } from "@/server/auth/session";
import { forUser } from "@/server/dal";
import { findSharedPlan } from "@/server/system/shared-plans";

const ctaClass = "rounded-xl bg-accent px-4 py-2.5 text-center font-semibold text-accent-foreground";

async function load(token: string) {
  return isShareToken(token) ? findSharedPlan(token) : null;
}

export async function generateMetadata({ params }: PageProps<"/p/[token]">): Promise<Metadata> {
  const plan = await load((await params).token);
  return { title: `${plan ? plan.name : "Link no longer active"} · Race Training` };
}

export default async function SharedPlanPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const plan = await load(token);
  if (!plan) {
    return (
      <NarrowPage>
        <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">Link no longer active</h1>
        <p className="text-muted">Ask whoever shared it for a new link.</p>
      </NarrowPage>
    );
  }

  const user = await getCurrentUser();
  const units = user ? (await forUser(user.id).settings.get()).units : "km";
  const next = followPath(token);

  return (
    <NarrowPage>
      <PlanReadOnly name={plan.name} authorName={plan.authorName} description={plan.description} doc={plan.doc} units={units} />
      <div className="flex flex-col gap-2">
        <Link href={user ? next : `/sign-up?plan=${token}`} className={ctaClass}>
          Follow this plan
        </Link>
        {user ? null : (
          <p className="text-center text-sm text-muted">
            Already have an account? <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in</Link>
          </p>
        )}
      </div>
    </NarrowPage>
  );
}
