import Link from "next/link";
import { z } from "zod";
import { goalToFormDefaults } from "@/components/goals/goal-defaults";
import { emptyGoalDefaults, GoalForm } from "@/components/goals/goal-form";
import { GoalFacts } from "@/components/goals/goal-summary";
import { ImportSection } from "@/components/import/import-section";
import { FollowForm } from "@/components/custom-plans/follow-form";
import { PlanReadOnly } from "@/components/custom-plans/plan-read-only";
import { SettingsStep } from "@/components/onboarding/settings-step";
import { dayLabel } from "@/components/plan/session-card";
import { PlanOverview } from "@/components/plan/plan-overview";
import { summarizeWarnings } from "@/lib/planning/describe";
import { planInsights } from "@/services/plans";
import { Card, SubmitButton } from "@/components/ui/form";
import { addDays } from "@/lib/time";
import { createGoalAction, updateGoalAction } from "@/server/actions/goals";
import { isShareToken } from "@/lib/custom-plans/share";
import { finishOnboardingAction, startSharedPlanAction } from "@/server/actions/onboarding";
import { requireUserContext } from "@/server/context";
import { findSharedPlan } from "@/server/system/shared-plans";
import { resolveFollowSource } from "@/services/training";

export const metadata = { title: "Get started · Race Training" };

const STEPS = [
  { key: "settings", label: "Your week" },
  { key: "goal", label: "First goal" },
  { key: "plan", label: "Plan preview" },
  { key: "import", label: "Apple Watch sync" },
] as const;

const PLAN_STEPS = [
  { key: "settings", label: "Your week" },
  { key: "start", label: "Start this plan" },
  { key: "plan", label: "Plan preview" },
  { key: "import", label: "Apple Watch sync" },
] as const;

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const params = await searchParams;
  const token = isShareToken(params.plan) ? params.plan : null;
  const steps = token ? PLAN_STEPS : STEPS;
  const step = z
    .enum(steps.map((s) => s.key) as [string, ...string[]])
    .catch("settings")
    .parse(params.step);
  const { scope, settings, today } = await requireUserContext();
  const active = await scope.goals.getActive();
  const index = steps.findIndex((s) => s.key === step);
  const planQuery = token ? `&plan=${token}` : "";

  const sharedPlan = token && step === "start" ? await findSharedPlan(token) : null;
  const activeFollow = token && (step === "start" || step === "plan") ? await scope.planFollows.getActive() : null;
  const alreadyFollowing = Boolean(sharedPlan && activeFollow && activeFollow.customPlanId === sharedPlan.planId);
  const followSource = token && step === "plan" && activeFollow ? await resolveFollowSource(scope, activeFollow) : null;
  const firstSession = followSource && activeFollow ? (await scope.sessions.listFor({ followId: activeFollow.id }))[0]?.date : undefined;
  const preview =
    !token && step === "plan" && active
      ? await planInsights(scope, active, settings, today, (await scope.sessions.listForGoal(active.id))[0]?.date)
      : null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <div>
        <p className="text-sm text-muted">
          Step {index + 2} of {steps.length + 1} · account created ✓
        </p>
        <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">{steps[index]?.label}</h1>
      </div>
      <ol className="flex gap-1" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s.key} className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-accent" : "bg-border"}`}>
            <span className="sr-only">
              {s.label}
              {i < index ? " (done)" : i === index ? " (current)" : ""}
            </span>
          </li>
        ))}
      </ol>

      {step === "settings" ? (
        <Card>
          <p className="text-sm text-muted">Tell us when you can run. You can change this any time in Settings.</p>
          <SettingsStep settings={settings} plan={token ?? undefined} />
        </Card>
      ) : null}

      {step === "start" && token ? (
        <Card>
          {!sharedPlan ? (
            <>
              <p className="text-sm">This plan&apos;s link is no longer active.</p>
              <Link href="/onboarding?step=goal" className="self-start text-sm font-medium text-accent">
                Set a goal instead →
              </Link>
            </>
          ) : alreadyFollowing ? (
            <>
              <p className="text-sm">You&apos;re all set.</p>
              <Link href={`/onboarding?step=plan${planQuery}`} className="self-start text-sm font-medium text-accent">
                Continue →
              </Link>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="font-condensed text-2xl leading-none font-extrabold uppercase">{sharedPlan.name}</p>
                <p className="text-sm text-muted">by {sharedPlan.authorName}</p>
              </div>
              <FollowForm
                action={startSharedPlanAction.bind(null, token)}
                today={today}
                showActivate={false}
                replacesActive={false}
              />
            </>
          )}
        </Card>
      ) : null}

      {step === "goal" ? (
        <Card>
          {active ? (
            <>
              <p className="text-sm text-muted">You already have an active goal — adjust it or continue.</p>
              <GoalForm
                action={updateGoalAction.bind(null, active.id)}
                defaults={goalToFormDefaults(active, settings.units)}
                units={settings.units}
                submitLabel="Save"
              />
              <Link href="/onboarding?step=plan" className="self-start text-sm font-medium text-accent">
                Continue →
              </Link>
            </>
          ) : (
            <GoalForm
              action={createGoalAction}
              defaults={emptyGoalDefaults}
              units={settings.units}
              minDate={addDays(today, 1)}
              submitLabel="Create goal & continue"
              redirectTo="/onboarding?step=plan"
            />
          )}
        </Card>
      ) : null}

      {step === "plan" && token ? (
        <Card>
          {followSource ? (
            <>
              <PlanReadOnly
                name={followSource.planName}
                authorName={followSource.authorName}
                description={followSource.description}
                doc={followSource.doc}
                units={settings.units}
              />
              <p className="text-sm">
                {followSource.doc.weeks.length} weeks{firstSession ? ` · first session ${dayLabel(firstSession)}` : ""}
              </p>
            </>
          ) : (
            <p className="text-sm">Start the plan first to see it here.</p>
          )}
          <div className="flex gap-3">
            <Link href={`/onboarding?step=start${planQuery}`} className="text-sm text-muted">
              ← Back
            </Link>
            <Link href={`/onboarding?step=import${planQuery}`} className="text-sm font-medium text-accent">
              Continue →
            </Link>
          </div>
        </Card>
      ) : null}

      {step === "plan" && !token ? (
        <Card>
          {active ? <GoalFacts goal={active} units={settings.units} today={today} /> : null}
          {preview ? (
            <>
              <PlanOverview
                units={settings.units}
                weeks={preview.weeks.map((w) => ({
                  index: w.index,
                  phase: w.phase,
                  km: preview.sessions.filter((s) => s.weekIndex === w.index).reduce((a, s) => a + s.targetKm, 0),
                }))}
              />
              <p className="text-sm">
                {preview.weeks.length} weeks · {preview.sessions.length} sessions. Volume grows by at most 10% a
                week, with an easier week every fourth week.
              </p>
              {summarizeWarnings(preview.warnings).map((w) => (
                <p key={w} className="rounded-lg border border-border p-3 text-sm text-muted">
                  {w}
                </p>
              ))}
            </>
          ) : (
            <p className="text-sm">Create a goal first to see your plan.</p>
          )}
          <div className="flex gap-3">
            <Link href="/onboarding?step=goal" className="text-sm text-muted">
              ← Back
            </Link>
            <Link href="/onboarding?step=import" className="text-sm font-medium text-accent">
              Continue →
            </Link>
          </div>
        </Card>
      ) : null}

      {step === "import" ? (
        <Card>
          <p className="text-sm">
            Workouts sync from your Apple Watch via the <strong>Health Auto Export</strong> iOS app. Create a
            token for your phone, then follow the guide. You can also do this later in Settings.
          </p>
          <ImportSection scope={scope} showStatus={false} />
          <form action={finishOnboardingAction}>
            <SubmitButton pendingLabel="Finishing…">Go to my dashboard</SubmitButton>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
