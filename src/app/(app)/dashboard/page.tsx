import Link from "next/link";
import { redirect } from "next/navigation";
import { GoalFacts } from "@/components/goals/goal-summary";
import { Card } from "@/components/ui/form";
import { needsResultPrompt } from "@/lib/goals/rules";
import { requireUserContext } from "@/server/context";

// Phase 2: goal summary only — the full dashboard lands in phase 5.
export default async function DashboardPage() {
  const { scope, settings, today } = await requireUserContext();
  if (!settings.onboardingCompletedAt) redirect("/onboarding");

  const goals = await scope.goals.list();
  const active = goals.find((g) => g.status === "active") ?? null;
  const awaitingResult = goals.filter((g) => needsResultPrompt(g, today));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      {awaitingResult.map((g) => (
        <Card key={g.id}>
          <p className="text-sm">
            <strong>{g.name}</strong> was on race day — how did it go?{" "}
            <Link href={`/goals/${g.id}#result`} className="font-medium text-accent">
              Log your result →
            </Link>
          </p>
        </Card>
      ))}
      {active ? (
        <Card title={active.name}>
          <GoalFacts goal={active} units={settings.units} today={today} />
        </Card>
      ) : (
        <Card>
          <p className="text-sm">No active goal.</p>
          <Link href="/goals/new" className="self-start text-sm font-medium text-accent">
            Create a goal →
          </Link>
        </Card>
      )}
    </div>
  );
}
