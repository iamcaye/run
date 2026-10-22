import Link from "next/link";
import { Suspense } from "react";
import { AdjustmentCard } from "@/components/adjustments/adjustment-card";
import { formatRaceDate, GoalFacts } from "@/components/goals/goal-summary";
import { MonthCalendar } from "@/components/plan/month-calendar";
import { PHASE_BG } from "@/components/plan/phase";
import { PlanOverview } from "@/components/plan/plan-overview";
import { RegenerateButton } from "@/components/plan/regenerate-button";
import { dayLabel, SessionCard } from "@/components/plan/session-card";
import { PlanLinks } from "@/components/custom-plans/plan-links";
import { ConfirmSubmitButton } from "@/components/ui/confirm-button";
import { Card } from "@/components/ui/form";
import { Bone } from "@/components/ui/skeleton";
import { planWeekNumber } from "@/lib/custom-plans/schedule";
import { resolveMonth, type YearMonth } from "@/lib/plan-calendar";
import { PHASE_LABELS, summarizeWarnings } from "@/lib/planning/describe";
import { addDays, startOfWeek, type IsoWeekday, type LocalDate } from "@/lib/time";
import { formatDistance } from "@/lib/units";
import { stopCustomPlanAction } from "@/server/actions/custom-plans";
import { requireUserContext } from "@/server/context";
import type { Goal, PlanFollow, PlannedSession, Settings, UserScope } from "@/server/dal";
import { toAdjustmentView } from "@/services/adjustment-view";
import { getPlanCalendar } from "@/services/plan-calendar";
import { planInsights } from "@/services/plans";
import { getActiveTraining } from "@/services/training";

export const metadata = { title: "Plan · Race Training" };

type WeekGroup = { start: string; sessions: PlannedSession[] };

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const { scope, settings, today } = await requireUserContext();
  const training = await getActiveTraining(scope);
  if (!training) {
    return (
      <Card title="No active goal" action={<PlanLinks />}>
        <p className="text-sm">Your plan is built from your active goal — or from a plan you build yourself.</p>
        <p className="flex flex-wrap gap-x-2 text-sm font-medium">
          <Link href="/goals" className="text-accent">
            Choose or create a goal →
          </Link>
          <span className="text-muted">·</span>
          <Link href="/plans" className="text-accent">
            or build your own plan →
          </Link>
        </p>
      </Card>
    );
  }

  const goal = training.kind === "goal" ? training.goal : null;
  const follow = training.kind === "plan" ? training.follow : null;
  const [sessions, adjustments] = await Promise.all([
    scope.sessions.listFor(training.owner),
    goal ? scope.adjustments.listForGoal(goal.id) : [],
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
  // Custom-plan sessions have no phase: their weeks render neutral.
  const phaseOf = (g: WeekGroup) => g.sessions[0]?.phase ?? (goal ? "base" : null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_1.3fr] lg:items-end lg:gap-6">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">{goal?.name ?? follow?.planName}</h1>
            <PlanLinks />
          </div>
          {goal ? <GoalFacts goal={goal} units={settings.units} today={today} /> : null}
          {follow ? <FollowFacts follow={follow} today={today} /> : null}
        </div>

        {/* Below lg this is one card; at lg the card dissolves so the overview sits in the band and warnings + regenerate span below it. */}
        <Card className="lg:contents">
          <div className="lg:rounded-[20px] lg:bg-surface lg:p-4">
            <PlanOverview
              units={settings.units}
              weeks={groups.map((g, i) => ({
                index: i,
                phase: phaseOf(g),
                km: g.sessions.reduce((a, s) => a + s.targetKm, 0),
                isCurrent: g.start === currentStart,
              }))}
            />
          </div>
          {goal ? (
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
          ) : null}
        </Card>
      </div>

      {groups.length === 0 ? (
        <Card>
          <p className="text-sm">
            {goal ? "No sessions planned — race day may already have passed." : "No sessions left in this plan."}
          </p>
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
            const phase = phaseOf(g);
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
                    {phase ? <span className={`inline-block size-2.5 rounded-full ${PHASE_BG[phase]}`} /> : null}
                    {phase ? `${PHASE_LABELS[phase]} · ` : ""}
                    {dayLabel(g.start)} · {formatDistance(total, settings.units)}
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

      {goal ? (
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
      ) : null}
    </div>
  );
}

/** "Week n of N · started <date>" plus the plan's actions. */
function FollowFacts({ follow, today }: { follow: PlanFollow; today: LocalDate }) {
  const total = follow.snapshot.weeks.length;
  const week = planWeekNumber(follow.startDate, today, total);
  const start = follow.startDate ? formatRaceDate(follow.startDate) : null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        {week !== null ? `Week ${week} of ${total}` : `${total} ${total === 1 ? "week" : "weeks"}`}
        {start ? (week !== null ? ` · started ${start}` : ` · starts ${start}`) : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {follow.customPlanId ? (
          <Link
            href={`/plans/${follow.customPlanId}`}
            className="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-semibold"
          >
            Edit plan
          </Link>
        ) : null}
        <form action={stopCustomPlanAction}>
          <ConfirmSubmitButton
            variant="secondary"
            className="px-3 py-1.5 text-sm"
            pendingLabel="Stopping…"
            confirmMessage={`Stop “${follow.planName}”? Its upcoming sessions will be removed; past ones stay.`}
          >
            Stop plan
          </ConfirmSubmitButton>
        </form>
      </div>
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
