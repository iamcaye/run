import Link from "next/link";
import { redirect } from "next/navigation";
import { AdjustmentCard } from "@/components/adjustments/adjustment-card";
import { AcwrChart } from "@/components/charts/acwr-chart";
import { LongRunChart } from "@/components/charts/long-run-chart";
import { RaceHero } from "@/components/dashboard/race-hero";
import { StatTile } from "@/components/dashboard/stat-tile";
import { TodayCard } from "@/components/dashboard/today-card";
import { VolumeBars } from "@/components/dashboard/volume-bars";
import { WeekStrip } from "@/components/dashboard/week-strip";
import { Card } from "@/components/ui/form";
import { addDays, startOfWeek, type IsoWeekday } from "@/lib/time";
import { formatDistance, formatDistanceValue } from "@/lib/units";
import { requireUserContext } from "@/server/context";
import { getDashboard } from "@/services/dashboard";
import { ensureWeeklyAdaptation } from "@/services/weekly-adaptation";

export const metadata = { title: "Dashboard · Race Training" };

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
        <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">Dashboard</h1>
        {prompts}
        <section className="flex flex-col items-start gap-3 rounded-[22px] bg-hero p-5 text-hero-foreground">
          <p className="font-condensed text-4xl leading-none font-extrabold italic uppercase">Pick your next race</p>
          <p className="text-sm">No active goal yet. Set a race and target and you&apos;ll get a plan built around it.</p>
          <Link
            href="/goals/new"
            className="rounded-[14px] bg-hero-foreground px-4 py-3 font-condensed text-lg font-bold tracking-wider text-hero uppercase"
          >
            Create a goal →
          </Link>
        </section>
      </div>
    );
  }

  const goal = d.goal;
  const week = d.thisWeekVolume;
  const acwr = d.acwrToday;

  const todaySession = d.thisWeek.find((s) => s.date === today) ?? null;
  const nextSession = d.thisWeek.find((s) => s.date > today && s.type !== "rest") ?? null;
  const weekStart = startOfWeek(today, settings.weekStart as IsoWeekday);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    return { date, session: d.thisWeek.find((s) => s.date === date) ?? null };
  });

  const profile = d.volume.map((w) => ({ ...w, isFuture: w.weekStart > today }));
  const runWeeks = profile
    .map((w, index) => ({ ...w, index }))
    .filter((w) => !w.isFuture)
    .slice(-12);

  const lastLong = d.longRuns.findLast((l) => l.date <= today && l.actualKm !== null) ?? null;
  const nextLong = d.longRuns.find((l) => l.date >= today && l.actualKm === null) ?? null;

  const suggestions =
    d.pendingAdjustments.length > 0 ? (
      <Card title="Suggested changes">
        {d.pendingAdjustments.map((a) => (
          <AdjustmentCard key={a.id} adjustment={a} units={units} />
        ))}
      </Card>
    ) : null;

  // DOM order is the mobile order. At lg the children are placed on a grid: only the rows in use exist
  // (so no empty-row gaps), and the last row is 1fr so the week card hugs the stats above it.
  const hasPrompts = d.awaitingResult.length > 0;
  const above = (hasPrompts ? 1 : 0) + (suggestions ? 1 : 0);
  const ROWS = ["lg:grid-rows-[auto_1fr]", "lg:grid-rows-[auto_auto_1fr]", "lg:grid-rows-[auto_auto_auto_1fr]"] as const;
  const START = ["lg:row-start-1", "lg:row-start-2", "lg:row-start-3", "lg:row-start-4"] as const;
  const heroStart = START[above];
  const weekRowStart = START[above + 1];
  const suggestionsStart = START[hasPrompts ? 1 : 0];
  const chartsSpan = `${heroStart} lg:row-span-2`;

  return (
    <div className={`flex flex-col gap-3.5 lg:grid lg:grid-cols-12 lg:items-start ${ROWS[above]}`}>
      {hasPrompts ? <div className="flex flex-col gap-3.5 lg:col-span-12 lg:row-start-1">{prompts}</div> : null}

      <div className={`flex flex-col gap-3.5 lg:col-span-5 lg:col-start-1 ${heroStart}`}>
        <RaceHero
          name={goal.name}
          distanceKm={goal.distanceKm}
          units={units}
          daysToRace={d.daysToRace}
          prediction={d.prediction}
          targetSeconds={goal.targetTimeSeconds}
          weeks={profile}
          weekNumber={d.weekNumber}
          totalWeeks={d.totalWeeks}
        />

        <TodayCard session={todaySession} next={nextSession} today={today} units={units} />

        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label="This week"
            value={
              week ? (
                <>
                  {formatDistanceValue(week.actualKm, units)}
                  <span className="text-base text-muted">
                    /{formatDistanceValue(week.plannedKm, units)} {units}
                  </span>
                </>
              ) : (
                "—"
              )
            }
            meter={week && week.plannedKm > 0 ? week.actualKm / week.plannedKm : undefined}
            detail={week?.compliance != null ? `${Math.round(week.compliance * 100)}% so far` : undefined}
          />
          <StatTile
            label="Load"
            value={acwr && acwr.ratio !== null && !acwr.insufficientHistory ? acwr.ratio.toFixed(2) : "—"}
            detail={
              !acwr || acwr.insufficientHistory ? (
                "After 4 weeks of runs"
              ) : acwr.flag === "high" ? (
                <span className="text-status-critical">▲ High — ease off</span>
              ) : acwr.flag === "low" ? (
                <span className="text-status-warning">▼ Low — building</span>
              ) : acwr.flag === "ok" ? (
                <span className="text-status-good">● In range</span>
              ) : (
                "No recent load"
              )
            }
          />
          <StatTile
            label="Long run"
            value={
              lastLong?.actualKm != null ? (
                <>
                  {formatDistanceValue(lastLong.actualKm, units)}
                  <span className="text-base text-muted"> {units}</span>
                </>
              ) : (
                "—"
              )
            }
            detail={nextLong ? `Next: ${formatDistance(nextLong.plannedKm, units, 0)}` : undefined}
          />
        </div>
      </div>

      {suggestions ? <div className={`lg:col-span-12 ${suggestionsStart}`}>{suggestions}</div> : null}

      <div className={`lg:col-span-5 lg:col-start-1 ${weekRowStart}`}>
        <Card
          title="This week"
          action={
            <Link href="/plan" className="text-sm font-semibold text-accent">
              Full plan →
            </Link>
          }
        >
          <WeekStrip days={weekDays} units={units} />
        </Card>
      </div>

      <div className={`flex flex-col gap-3.5 lg:col-span-7 lg:col-start-6 ${chartsSpan}`}>
        {runWeeks.length > 0 ? (
          <Card>
            <VolumeBars weeks={runWeeks} units={units} />
          </Card>
        ) : null}

        <div className="grid gap-3.5 xl:grid-cols-2">
          <Card className={d.longRuns.length === 0 ? "xl:col-span-2" : ""}>
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
      </div>
    </div>
  );
}
