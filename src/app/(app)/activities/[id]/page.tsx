import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { activityDate } from "@/components/activities/activity-row";
import { HrChart } from "@/components/activities/hr-chart";
import { RouteMapLazy } from "@/components/activities/route-map-lazy";
import { rpeLabel } from "@/components/activities/rpe";
import { RpeNotesForm } from "@/components/activities/rpe-notes-form";
import { ZoneBars } from "@/components/activities/zone-bars";
import { StatTile } from "@/components/dashboard/stat-tile";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { Card, FormSuccess } from "@/components/ui/form";
import { SESSION_LABELS } from "@/lib/planning/describe";
import { localDateOf } from "@/lib/time";
import { formatDistance, formatDuration, formatPace } from "@/lib/units";
import { deleteActivityAction } from "@/server/actions/activities";
import { requireUserContext } from "@/server/context";
import { getActivityDetail } from "@/services/activities";

export const metadata = { title: "Run · Race Training" };

export default async function ActivityPage({ params, searchParams }: PageProps<"/activities/[id]">) {
  const { id } = await params;
  const justLogged = (await searchParams).logged === "1";
  const { scope, settings } = await requireUserContext();
  const detail = z.uuid().safeParse(id).success ? await getActivityDetail(scope, id, settings) : null;
  if (!detail) notFound();

  const { activity: a, session, splits, route, zones, timeInZones } = detail;
  const units = settings.units;
  const pace = a.seconds / a.km;
  const fastest = splits.length ? Math.min(...splits.filter((s) => s.km >= 0.5).map((s) => s.paceSecPerKm)) : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/activities" className="text-sm text-muted">
        ← Activities
      </Link>
      {justLogged ? <FormSuccess>Run logged{session ? ` and linked to your ${SESSION_LABELS[session.type].toLowerCase()}` : ""}.</FormSuccess> : null}
      <div>
        <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">{activityDate(localDateOf(a.startAt, settings.timezone))}</h1>
        <p className="text-sm text-muted">
          {session ? SESSION_LABELS[session.type] : "Unplanned run"}
          {a.source === "manual" ? " · logged manually" : " · from Apple Watch"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Distance" value={formatDistance(a.km, units, 2)} />
        <StatTile label="Time" value={formatDuration(a.seconds)} />
        <StatTile label="Pace" value={formatPace(pace, units)} />
        <StatTile
          label="Heart rate"
          value={a.avgHr ? `${a.avgHr}` : "—"}
          detail={a.avgHr ? `avg bpm${a.maxHr ? ` · max ${a.maxHr}` : ""}` : "no HR data"}
        />
      </div>

      {session ? (
        <Card title="Planned session">
          <p className="text-sm">
            {SESSION_LABELS[session.type]}: {formatDistance(session.targetKm, units)} planned
            {session.targetPaceSecPerKm ? ` at ${formatPace(session.targetPaceSecPerKm, units)}` : ""} — you ran{" "}
            <strong>{formatDistance(a.km, units)}</strong> at <strong>{formatPace(pace, units)}</strong>.
          </p>
          {session.effortDescription ? <p className="text-sm text-muted">{session.effortDescription}</p> : null}
        </Card>
      ) : null}

      <Card title="How did it feel?">
        <RpeNotesForm activityId={a.id} rpe={a.rpe} notes={a.notes} />
        {a.rpe ? <p className="text-xs text-muted">Current: RPE {a.rpe} — {rpeLabel(a.rpe)}</p> : null}
      </Card>

      {route.length > 1 ? (
        <Card title="Route">
          <RouteMapLazy points={route} />
        </Card>
      ) : null}

      {splits.length > 0 ? (
        <Card title="Splits">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 font-medium">km</th>
                <th className="py-1 font-medium">Time</th>
                <th className="py-1 font-medium">Pace</th>
              </tr>
            </thead>
            <tbody>
              {splits.map((s) => (
                <tr key={s.index} className="border-t border-border">
                  <td className="py-1.5">{s.km < 1 ? s.km.toFixed(2) : s.index}</td>
                  <td className="py-1.5">{formatDuration(s.seconds)}</td>
                  <td className={`py-1.5 ${s.paceSecPerKm === fastest ? "font-semibold" : ""}`}>
                    {formatPace(s.paceSecPerKm, "km")}
                    {s.paceSecPerKm === fastest ? " · fastest" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {units === "mi" ? <p className="text-xs text-muted">Splits are per kilometre.</p> : null}
        </Card>
      ) : null}

      {a.hrSeries && a.hrSeries.length > 1 ? (
        <Card>
          <HrChart samples={a.hrSeries} zoneFloors={(zones ?? []).map((z) => ({ zone: z.zone, bpm: z.minBpm }))} />
        </Card>
      ) : null}

      {zones && timeInZones ? (
        <Card>
          <ZoneBars zones={zones} seconds={timeInZones} />
        </Card>
      ) : a.hrSeries?.length ? (
        <p className="text-xs text-muted">
          Add your max and resting heart rate in <Link href="/settings" className="text-accent">Settings</Link> to see time in zones.
        </p>
      ) : null}

      {a.source === "manual" ? (
        <form action={deleteActivityAction.bind(null, a.id)}>
          <ConfirmSubmitButton variant="secondary" className="text-danger" confirmMessage="Delete this run?">
            Delete run
          </ConfirmSubmitButton>
        </form>
      ) : null}
    </div>
  );
}
