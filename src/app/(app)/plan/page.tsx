import Link from "next/link";
import { GoalFacts } from "@/components/goals/goal-summary";
import { PHASE_BG } from "@/components/plan/phase";
import { PlanOverview } from "@/components/plan/plan-overview";
import { RegenerateButton } from "@/components/plan/regenerate-button";
import { dayLabel, SessionCard } from "@/components/plan/session-card";
import { Card } from "@/components/ui/form";
import { PHASE_LABELS, summarizeWarnings } from "@/lib/planning/describe";
import { addDays, startOfWeek, type IsoWeekday } from "@/lib/time";
import { formatDistance } from "@/lib/units";
import { requireUserContext } from "@/server/context";
import type { PlannedSession } from "@/server/dal";
import { planInsights } from "@/services/plans";

export const metadata = { title: "Plan · Race Training" };

type WeekGroup = { start: string; sessions: PlannedSession[] };

export default async function PlanPage() {
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
  const insights = await planInsights(scope, goal, settings, today, sessions[0]?.date);

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
  const warnings = summarizeWarnings(insights.warnings);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{goal.name}</h1>
        <GoalFacts goal={goal} units={settings.units} today={today} />
      </div>

      <Card>
        <PlanOverview
          units={settings.units}
          weeks={groups.map((g, i) => ({
            index: i,
            phase: g.sessions[0]?.phase ?? "base",
            km: g.sessions.reduce((a, s) => a + s.targetKm, 0),
            isCurrent: g.start === currentStart,
          }))}
        />
        {warnings.length ? (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        <div id="regenerate" className="flex flex-col gap-1 border-t border-border pt-3">
          <p className="text-sm text-muted">
            Changed your goal or availability? Rebuild the sessions from today on.
          </p>
          <RegenerateButton goalId={goal.id} />
        </div>
      </Card>

      {groups.length === 0 ? (
        <Card>
          <p className="text-sm">No sessions planned — race day may already have passed.</p>
        </Card>
      ) : null}

      {groups.map((g, i) => {
        const phase = g.sessions[0]?.phase ?? "base";
        const total = g.sessions.reduce((a, s) => a + s.targetKm, 0);
        const isCurrent = g.start === currentStart;
        const isPast = addDays(g.start, 6) < today;
        return (
          <section key={g.start} aria-labelledby={`week-${g.start}`} className="flex flex-col gap-2">
            <h2 id={`week-${g.start}`} className="flex items-center gap-2 text-sm">
              <span className={`inline-block size-2.5 rounded-sm ${PHASE_BG[phase]}`} />
              <span className="font-semibold">
                Week {i + 1}
                {isCurrent ? " · this week" : ""}
              </span>
              <span className="text-muted">
                {PHASE_LABELS[phase]} · {dayLabel(g.start)} · {formatDistance(total, settings.units)}
              </span>
            </h2>
            {isPast && !isCurrent ? (
              <details>
                <summary className="cursor-pointer text-xs text-muted">Show {g.sessions.length} past sessions</summary>
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

      <Card title="Adjustment history">
        {adjustments.length === 0 ? (
          <p className="text-sm text-muted">No adjustments yet. Weekly check-ins will propose changes here.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {adjustments.map((a) => (
              <li key={a.id}>
                <span className="text-muted">{a.runWeekStart} · {a.status}</span> — {a.reason}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
