import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SessionCard } from "@/components/plan/session-card";
import { SessionEditForm } from "@/components/plan/session-edit-form";
import { Card } from "@/components/ui/form";
import { NarrowPage } from "@/components/ui/narrow-page";
import { toDisplayDistance } from "@/lib/units";
import { editSessionAction } from "@/server/actions/plans";
import { requireUserContext } from "@/server/context";

export const metadata = { title: "Edit session · Race Training" };

export default async function SessionPage({ params }: PageProps<"/plan/sessions/[id]">) {
  const { id } = await params;
  const { scope, settings, today } = await requireUserContext();
  const session = z.uuid().safeParse(id).success ? await scope.sessions.get(id) : null;
  const goal = session ? await scope.goals.get(session.goalId) : null;
  if (!session || !goal || session.type === "race") notFound();

  return (
    <NarrowPage>
      <Link href={`/plan?month=${session.date.slice(0, 7)}#${session.date}`} className="text-sm text-muted">
        ← Plan
      </Link>
      <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">Edit session</h1>
      <SessionCard session={session} units={settings.units} today={today} editable={false} />
      <Card>
        <SessionEditForm
          action={editSessionAction.bind(null, session.id)}
          units={settings.units}
          maxDate={goal.raceDate}
          defaults={{
            date: session.date,
            type: session.type,
            distance: String(Number(toDisplayDistance(session.targetKm, settings.units).toFixed(1))),
            effortDescription: session.effortDescription ?? "",
          }}
        />
      </Card>
    </NarrowPage>
  );
}
