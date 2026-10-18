import Link from "next/link";
import { redirect } from "next/navigation";
import { AdjustmentCard } from "@/components/adjustments/adjustment-card";
import { AcwrChart } from "@/components/charts/acwr-chart";
import { LongRunChart } from "@/components/charts/long-run-chart";
import { VolumeChart } from "@/components/charts/volume-chart";
import { StatTile } from "@/components/dashboard/stat-tile";
import { StatusChip } from "@/components/dashboard/status-chip";
import { dayLabel } from "@/components/plan/session-card";
import { Card } from "@/components/ui/form";
import { PHASE_LABELS, SESSION_LABELS } from "@/lib/planning/describe";
import { formatDistance, formatDuration, toDisplayDistance } from "@/lib/units";
import { requireUserContext } from "@/server/context";
import { getDashboard } from "@/services/dashboard";
import { ensureWeeklyAdaptation } from "@/services/weekly-adaptation";

export const metadata = { title: "Dashboard · Race Training" };

function signedDuration(seconds: number): string {
  return `${seconds > 0 ? "+" : "−"}${formatDuration(Math.abs(seconds))}`;
}

export default async function DashboardPage() {
  const { scope, settings, today } = await requireUserContext();
  if (!settings.onboardingCompletedAt) redirect("/onboarding");
  // On-demand fallback for the weekly job: same function and idempotency as the cron.
  await ensureWeeklyAdaptation(scope).catch((err: unknown) => console.error("weekly adaptation failed", err));
  const d = await getDashboard(scope, settings, today);
  const units = settings.units;

  const prompts = d.awaitingResult.map((g) => (
    <Card key={g.id}>
      <p className="text-sm">
        <strong>{g.name}</strong> was on race day — how did it go?{" "}
        <Link href={`/goals/${g.id}#result`} className="font-medium text-accent">
          Log your result →
        </Link>
      </p>
    </Card>
  ));

  if (!d.goal) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        {prompts}
        <Card>
          <p className="text-sm">No active goal.</p>
          <Link href="/goals/new" className="self-start text-sm font-medium text-accent">
            Create a goal →
          </Link>
        </Card>
      </div>
    );
  }

  const goal = d.goal;
  const week = d.thisWeekVolume;
  const acwr = d.acwrToday;
  const target = goal.targetTimeSeconds;
  const pred = d.prediction;

  return (
    <div className="flex flex-col gap-4">
      {prompts}

      <section aria-labelledby="goal-title" className="flex flex-col gap-1">
        <h1 id="goal-title" className="text-xl font-semibold">
          {goal.name}
        </h1>
        <p className="text-sm text-muted">
          {d.daysToRace !== null && d.daysToRace > 0
            ? `${d.daysToRace} day${d.daysToRace === 1 ? "" : "s"} to go`
            : d.daysToRace === 0
              ? "Race day!"
              : "Race day has passed"}
          {d.phase ? ` · ${PHASE_LABELS[d.phase]}` : ""}
          {d.weekNumber && d.totalWeeks ? ` · week ${d.weekNumber} of ${d.totalWeeks}` : ""}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile
          label={target ? "Predicted vs target" : "Predicted finish"}
          value={pred ? formatDuration(pred.predictedSeconds) : "—"}
          detail={
            pred ? (
              <>
                {target
                  ? `${signedDuration(pred.predictedSeconds - target)} vs ${formatDuration(target)} target`
                  : `from a ${formatDistance(pred.fromKm, units)} run`}
                {pred.basis === "any" ? (
                  <span className="block">From an easy run — likely conservative until you log a harder effort.</span>
                ) : null}
              </>
            ) : (
              `Needs a run of ${formatDistance(Math.max(3, goal.distanceKm * 0.25), units, 0)}+ in the last 6 weeks`
            )
          }
        />
        <StatTile
          label="This week"
          value={week ? `${formatDistance(week.actualKm, units, 0)}` : "—"}
          detail={
            week
              ? `of ${formatDistance(week.plannedKm, units, 0)} planned${week.compliance !== null ? ` · ${Math.round(week.compliance * 100)}% so far` : ""}`
              : undefined
          }
        />
        <StatTile
          label="Load ratio (ACWR)"
          value={acwr && acwr.ratio !== null && !acwr.insufficientHistory ? acwr.ratio.toFixed(2) : "—"}
          detail={
            !acwr || acwr.insufficientHistory
              ? "Available after 4 weeks of runs"
              : acwr.flag === "high"
              ? "▲ High — ease off"
              : acwr.flag === "low"
                ? "▼ Low — building back"
                : acwr.flag === "ok"
                  ? "● In range"
                  : "No recent load"
          }
        />
      </div>

      {d.pendingAdjustments.length > 0 ? (
        <Card title="Suggested changes">
          {d.pendingAdjustments.map((a) => (
            <AdjustmentCard key={a.id} adjustment={a} units={units} />
          ))}
        </Card>
      ) : null}

      <Card title="This week" action={<Link href="/plan" className="text-sm text-accent">Full plan →</Link>}>
        {d.thisWeek.length === 0 ? (
          <p className="text-sm text-muted">No sessions this week.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {d.thisWeek.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-20 shrink-0 text-xs text-muted">{dayLabel(s.date)}</span>
                <span className="flex-1">{SESSION_LABELS[s.type]}</span>
                <span className="whitespace-nowrap tabular-nums text-muted">
                  {s.actualKm !== null
                    ? `${toDisplayDistance(s.actualKm, units).toFixed(1)} / ${formatDistance(s.targetKm, units)}`
                    : formatDistance(s.targetKm, units)}
                </span>
                <span className="w-20 text-right">
                  <StatusChip status={s.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <VolumeChart
          units={units}
          data={d.volume.map((w) => ({
            weekStart: w.weekStart,
            plannedKm: w.plannedKm,
            actualKm: w.actualKm,
            isCurrent: w.isCurrent,
            isFuture: w.weekStart > today,
          }))}
        />
      </Card>

      <Card>
        <AcwrChart
          // Ratios computed on less than a full 28-day window are artifacts (one week of runs = 4.0): not plotted.
          data={d.acwr.map((p) => ({ date: p.date, ratio: p.insufficientHistory ? null : p.ratio, acute: p.acute, chronic: p.chronic }))}
          insufficientHistory={acwr?.insufficientHistory ?? true}
        />
        {d.estimatedLoadShare > 0.5 ? (
          <p className="text-xs text-muted">
            Most recent runs have no RPE logged, so load is estimated from heart rate or session type. Logging RPE
            makes this more accurate.
          </p>
        ) : null}
      </Card>

      {d.longRuns.length > 0 ? (
        <Card>
          <LongRunChart units={units} data={d.longRuns} />
        </Card>
      ) : null}
    </div>
  );
}
