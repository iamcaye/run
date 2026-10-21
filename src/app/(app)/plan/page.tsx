import Link from "next/link";
import { Suspense } from "react";
import { AdjustmentCard } from "@/components/adjustments/adjustment-card";
import { GoalFacts } from "@/components/goals/goal-summary";
import { MonthCalendar } from "@/components/plan/month-calendar";
import { PHASE_BG } from "@/components/plan/phase";
import { PlanOverview } from "@/components/plan/plan-overview";
import { RegenerateButton } from "@/components/plan/regenerate-button";
import { dayLabel, SessionCard } from "@/components/plan/session-card";
import { Card } from "@/components/ui/form";
import { Bone } from "@/components/ui/skeleton";
import { resolveMonth, type YearMonth } from "@/lib/plan-calendar";
import { PHASE_LABELS, summarizeWarnings } from "@/lib/planning/describe";
import { addDays, startOfWeek, type IsoWeekday, type LocalDate } from "@/lib/time";
import { formatDistance } from "@/lib/units";
import { requireUserContext } from "@/server/context";
import type { Goal, PlannedSession, Settings, UserScope } from "@/server/dal";
import { toAdjustmentView } from "@/services/adjustment-view";
import { getPlanCalendar } from "@/services/plan-calendar";
import { planInsights } from "@/services/plans";

export const metadata = { title: "Plan · Race Training" };

type WeekGroup = { start: string; sessions: PlannedSession[] };

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const { scope, settings, today } = await requireUserContext();
  const goal = await scope.goals.getActive();
  if (!goal) {
    return (
      <Card title="No active goal">
        <p className="text-sm">Your plan is built from your active goal.</p>
        <Link href="/goals" className="self-start text-sm font-medium text-accent">
          Choose or create a goal →
        </Link>
      </Card>
    );
  }

  const [sessions, adjustments] = await Promise.all([
    scope.sessions.listForGoal(goal.id),
    scope.adjustments.listForGoal(goal.id),
  ]);
  const monthParam = (await searchParams).month;
  const month = resolveMonth(typeof monthParam === "string" ? monthParam : undefined, today, sessions);

  // Group by calendar week (user-moved sessions land in the week they now sit in).
  const weekStart = settings.weekStart as IsoWeekday;
  const groups: WeekGroup[] = [];
  for (const s of sessions) {
    const start = startOfWeek(s.date, weekStart);
    const last = groups.at(-1);
    if (last?.start === start) last.sessions.push(s);
    else groups.push({ start, sessions: [s] });
  }
  const currentStart = startOfWeek(today, weekStart);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_1.3fr] lg:items-end lg:gap-6">
        <div>
          <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">{goal.name}</h1>
          <GoalFacts goal={goal} units={settings.units} today={today} />
        </div>

        {/* Below lg this is one card; at lg the card dissolves so the overview sits in the band and warnings + regenerate span below it. */}
        <Card className="lg:contents">
          <div className="lg:rounded-[20px] lg:bg-surface lg:p-4">
            <PlanOverview
              units={settings.units}
              weeks={groups.map((g, i) => ({
                index: i,
                phase: g.sessions[0]?.phase ?? "base",
                km: g.sessions.reduce((a, s) => a + s.targetKm, 0),
                isCurrent: g.start === currentStart,
              }))}
            />
          </div>
          <div className="flex flex-col gap-4 lg:col-span-2 lg:rounded-[20px] lg:bg-surface lg:p-4">
            {/* Warnings and the month grid need more queries and a plan re-run: they stream in after the rest. */}
            <Suspense fallback={null}>
              <PlanWarnings scope={scope} goal={goal} settings={settings} today={today} planStart={sessions[0]?.date} />
            </Suspense>
            <div id="regenerate" className="flex flex-col gap-1 border-t border-border pt-3 lg:border-t-0 lg:pt-0">
              <p className="text-sm text-muted">
                Changed your goal or availability? Rebuild the sessions from today on.
              </p>
              <RegenerateButton goalId={goal.id} />
            </div>
          </div>
        </Card>
      </div>

      {groups.length === 0 ? (
        <Card>
          <p className="text-sm">No sessions planned — race day may already have passed.</p>
        </Card>
      ) : null}

      <div className="hidden lg:block">
        <Suspense fallback={<Bone className="h-[640px] rounded-[20px]" />}>
          <PlanMonth scope={scope} settings={settings} sessions={sessions} month={month} today={today} />
        </Suspense>
      </div>

      {groups.length > 0 ? (
        <div className="flex flex-col gap-4 lg:hidden">
          {groups.map((g, i) => {
            const phase = g.sessions[0]?.phase ?? "base";
            const total = g.sessions.reduce((a, s) => a + s.targetKm, 0);
            const isCurrent = g.start === currentStart;
            const isPast = addDays(g.start, 6) < today;
            return (
              <section key={g.start} aria-labelledby={`week-${g.start}`} className="flex flex-col gap-2">
                <h2 id={`week-${g.start}`} className="flex flex-wrap items-baseline gap-x-2 px-1 pt-2">
                  <span className="font-condensed text-xl font-extrabold uppercase">
                    Week {i + 1}
                    {isCurrent ? <span className="text-accent"> · this week</span> : null}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
                    <span className={`inline-block size-2.5 rounded-full ${PHASE_BG[phase]}`} />
                    {PHASE_LABELS[phase]} · {dayLabel(g.start)} · {formatDistance(total, settings.units)}
                  </span>
                </h2>
                {isPast && !isCurrent ? (
                  <details>
                    <summary className="cursor-pointer px-1 text-xs font-semibold text-muted">
                      Show {g.sessions.length} past sessions
                    </summary>
                    <div className="mt-2 flex flex-col gap-2">
                      {g.sessions.map((s) => (
                        <SessionCard key={s.id} session={s} units={settings.units} today={today} />
                      ))}
                    </div>
                  </details>
                ) : (
                  g.sessions.map((s) => <SessionCard key={s.id} session={s} units={settings.units} today={today} />)
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      <Card title="Adjustment history">
        {adjustments.length === 0 ? (
          <p className="text-sm text-muted">No adjustments yet. Weekly check-ins will propose changes here.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {adjustments.map((a) => (
              <AdjustmentCard key={a.id} adjustment={toAdjustmentView(a, sessions)} units={settings.units} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

async function PlanWarnings({
  scope,
  goal,
  settings,
  today,
  planStart,
}: {
  scope: UserScope;
  goal: Goal;
  settings: Settings;
  today: LocalDate;
  planStart: LocalDate | undefined;
}) {
  const warnings = summarizeWarnings((await planInsights(scope, goal, settings, today, planStart)).warnings);
  if (!warnings.length) return null;
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
      {warnings.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  );
}

async function PlanMonth({
  scope,
  settings,
  sessions,
  month,
  today,
}: {
  scope: UserScope;
  settings: Settings;
  sessions: PlannedSession[];
  month: YearMonth;
  today: LocalDate;
}) {
  const grid = await getPlanCalendar(scope, settings, sessions, month, today);
  return <MonthCalendar grid={grid} units={settings.units} />;
}
