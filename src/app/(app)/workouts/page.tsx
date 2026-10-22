import Link from "next/link";
import { StructureBar } from "@/components/plan/structure-bar";
import { Card } from "@/components/ui/form";
import { estimateLabel } from "@/lib/custom-plans/editor-model";
import { SESSION_LABELS } from "@/lib/planning/describe";
import { requireUserContext } from "@/server/context";

export const metadata = { title: "My workouts · Race Training" };

export default async function WorkoutsPage() {
  const { scope, settings } = await requireUserContext();
  const workouts = await scope.workouts.list();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">My workouts</h1>
        <Link href="/workouts/new" className="rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground">
          New workout
        </Link>
      </div>
      {workouts.length === 0 ? (
        <Card title="No workouts yet">
          <p className="text-sm text-muted">
            A workout is a reusable session you build from blocks: a warm-up, repeats at a target pace, a cool-down. Save
            the ones you like here, then drop them into your own training plans.
          </p>
          <Link href="/workouts/new" className="text-sm font-medium text-accent">
            Build your first workout →
          </Link>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
          {workouts.map((w) => (
            <li key={w.id}>
              <Link href={`/workouts/${w.id}`} className="flex flex-col gap-2 rounded-[20px] bg-surface p-4 hover:outline-2 hover:outline-border">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-condensed text-2xl leading-tight font-bold uppercase">{w.name}</span>
                  <span className="shrink-0 text-xs font-semibold text-muted uppercase">{SESSION_LABELS[w.type]}</span>
                </div>
                <StructureBar steps={w.steps} units={settings.units} size="sm" />
                <span className="text-sm text-muted tabular-nums">{estimateLabel(w.steps, settings.units)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
