import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { WorkoutForm } from "@/components/workouts/workout-form";
import { requireUserContext } from "@/server/context";

export const metadata = { title: "Workout · Race Training" };

export default async function WorkoutPage({ params }: PageProps<"/workouts/[id]">) {
  const { id } = await params;
  const { scope, settings } = await requireUserContext();
  // Another user's workout (or a malformed id) is indistinguishable from a missing one.
  const workout = z.uuid().safeParse(id).success ? await scope.workouts.get(id) : null;
  if (!workout) notFound();

  const { name, type, notes, steps } = workout;
  return (
    <div className="flex flex-col gap-4 lg:max-w-2xl">
      <Link href="/workouts" className="text-sm text-muted">
        ← My workouts
      </Link>
      <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">{name}</h1>
      <WorkoutForm key={workout.updatedAt.toISOString()} id={workout.id} initial={{ name, type, notes, steps }} units={settings.units} />
    </div>
  );
}
