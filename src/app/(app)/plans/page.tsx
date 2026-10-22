import Link from "next/link";
import { NewPlanForm } from "@/components/custom-plans/new-plan-form";
import { Card } from "@/components/ui/form";
import { requireUserContext } from "@/server/context";

export const metadata = { title: "My plans · Race Training" };

export default async function PlansPage() {
  const { scope, settings } = await requireUserContext();
  const [plans, follow] = await Promise.all([scope.customPlans.list(), scope.planFollows.getActive()]);
  const updated = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: settings.timezone });

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">My plans</h1>
        <Link href="/workouts" className="text-sm font-medium text-accent">
          My workouts →
        </Link>
      </div>

      <Card title="New plan">
        <NewPlanForm />
      </Card>

      {plans.length === 0 ? (
        <Card title="No plans yet">
          <p className="text-sm text-muted">
            Build your own week-by-week plan: lay out one week, duplicate it, then tweak each copy. When it&apos;s ready,
            activate it and its workouts land in your calendar.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {plans.map((p) => {
            const weeks = p.doc.weeks.length;
            const active = follow?.customPlanId === p.id;
            return (
              <li key={p.id}>
                <Link
                  href={`/plans/${p.id}`}
                  className="flex flex-col gap-1 rounded-[20px] bg-surface p-4 hover:outline-2 hover:outline-border"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-condensed text-2xl leading-tight font-bold uppercase">{p.name}</span>
                    {active ? (
                      <span className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground uppercase">
                        Active
                      </span>
                    ) : null}
                  </div>
                  <span className="text-sm text-muted">
                    {weeks} week{weeks === 1 ? "" : "s"} · updated {updated.format(p.updatedAt)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
