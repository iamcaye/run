import Link from "next/link";
import { ActivityRow } from "@/components/activities/activity-row";
import { ManualRunForm } from "@/components/activities/manual-run-form";
import { RpeNotesForm } from "@/components/activities/rpe-notes-form";
import { Card } from "@/components/ui/form";
import { NarrowPage } from "@/components/ui/narrow-page";
import { toActivityRows } from "@/server/activity-rows";
import { requireUserContext } from "@/server/context";

export const metadata = { title: "Quick log · Race Training" };

/** Right after a run: rate the latest activity, or log one the watch missed. */
export default async function QuickLogPage() {
  const { scope, settings, today } = await requireUserContext();
  const [latest] = await scope.activities.list({ limit: 1 });
  const [row] = latest ? await toActivityRows(scope, [latest], settings.timezone) : [];

  return (
    <NarrowPage>
      <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">Quick log</h1>

      <Card title="Your latest run">
        {latest && row ? (
          <>
            <ul className="-my-3 divide-y divide-border">
              <ActivityRow a={row} units={settings.units} />
            </ul>
            <RpeNotesForm key={latest.id} activityId={latest.id} rpe={latest.rpe} notes={latest.notes} />
          </>
        ) : (
          <p className="text-sm text-muted">
            No runs yet. Connect <Link href="/settings" className="text-accent">Apple Watch sync</Link>, or log one below.
          </p>
        )}
      </Card>

      <section id="manual">
        <Card title="Log a run manually">
          <p className="-mt-2 text-sm text-muted">For runs your watch didn&apos;t record. It&apos;s linked to that day&apos;s planned session.</p>
          <ManualRunForm today={today} units={settings.units} />
        </Card>
      </section>
    </NarrowPage>
  );
}
