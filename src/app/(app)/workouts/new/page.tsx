import Link from "next/link";
import { WorkoutForm } from "@/components/workouts/workout-form";
import { newBlock } from "@/lib/custom-plans/editor-model";
import type { PlanWorkout } from "@/lib/custom-plans/types";
import { requireUserContext } from "@/server/context";

export const metadata = { title: "New workout · Race Training" };

export default async function NewWorkoutPage() {
  const { settings } = await requireUserContext();
  const initial: PlanWorkout = {
    name: "New workout",
    type: "intervals",
    notes: null,
    steps: [newBlock("warmup"), newBlock("reps"), newBlock("cooldown")],
  };
  return (
    <div className="flex flex-col gap-4 lg:max-w-2xl">
      <Link href="/workouts" className="text-sm text-muted">
        ← My workouts
      </Link>
      <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">New workout</h1>
      <WorkoutForm id={null} initial={initial} units={settings.units} />
    </div>
  );
}
