import Link from "next/link";
import { z } from "zod";
import { ACTIVITY_COLUMNS, ActivityRow } from "@/components/activities/activity-row";
import { Card } from "@/components/ui/form";
import { toActivityRows } from "@/server/activity-rows";
import { requireUserContext } from "@/server/context";

export const metadata = { title: "Activities · Race Training" };

const PAGE_SIZE = 25;

export default async function ActivitiesPage({ searchParams }: PageProps<"/activities">) {
  const page = z.coerce.number().int().min(1).catch(1).parse((await searchParams).page);
  const { scope, settings } = await requireUserContext();
  // One extra row tells us whether there's a next page.
  const activities = await scope.activities.list({ limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE });
  const rows = await toActivityRows(scope, activities.slice(0, PAGE_SIZE), settings.timezone);
  const hasNext = activities.length > PAGE_SIZE;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">Activities</h1>
        <Link href="/log#manual" className="rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground">
          Log a run
        </Link>
      </div>
      <Card>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">
            No runs yet. Set up <Link href="/settings" className="text-accent">Apple Watch sync</Link> or log a run by hand.
          </p>
        ) : (
          <>
            <div
              aria-hidden
              className={`hidden items-center gap-3 text-xs font-semibold tracking-wide text-muted uppercase lg:grid ${ACTIVITY_COLUMNS}`}
            >
              <span>Date</span>
              <span>Type</span>
              <span>Distance</span>
              <span>Time</span>
              <span>Pace</span>
              <span>Avg HR</span>
              <span>RPE</span>
            </div>
            <ul className="-my-3 divide-y divide-border lg:-mt-1">
              {rows.map((a) => (
                <ActivityRow key={a.id} a={a} units={settings.units} columns />
              ))}
            </ul>
          </>
        )}
      </Card>
      {page > 1 || hasNext ? (
        <nav aria-label="Pages" className="flex justify-between text-sm">
          {page > 1 ? <Link href={`/activities?page=${page - 1}`}>← Newer</Link> : <span />}
          {hasNext ? <Link href={`/activities?page=${page + 1}`}>Older →</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
