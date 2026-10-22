import { StructureBar } from "@/components/plan/structure-bar";
import { PlanProfile } from "@/components/dashboard/volume-profile";
import { weekTotals } from "@/lib/custom-plans/ops";
import { workoutSummary } from "@/lib/custom-plans/summary";
import type { CustomPlanDoc } from "@/lib/custom-plans/types";
import { describeStep } from "@/lib/planning/describe";
import { WEEKDAY_LABELS, type IsoWeekday } from "@/lib/time";
import { formatDistance, type Units } from "@/lib/units";

const DAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

/** A plan as its readers see it: profile, then each week's days with expandable workouts. Plain props only. */
export function PlanReadOnly({
  name,
  authorName,
  description,
  doc,
  units,
}: {
  name: string;
  authorName?: string | null;
  description: string | null;
  doc: CustomPlanDoc;
  units: Units;
}) {
  const weeks = doc.weeks.length;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-condensed text-3xl leading-none font-extrabold uppercase">{name}</h1>
        <p className="text-sm text-muted">
          {authorName ? `by ${authorName} · ` : ""}
          {weeks} week{weeks === 1 ? "" : "s"}
        </p>
        {description ? <p className="mt-1 max-w-prose text-sm whitespace-pre-line">{description}</p> : null}
      </header>

      <section className="rounded-[20px] bg-surface p-4">
        <PlanProfile
          weeks={doc.weeks.map((w) => ({ plannedKm: weekTotals(w).km, phase: null, isCurrent: false, isFuture: true }))}
          units={units}
        />
      </section>

      {doc.weeks.map((week, i) => (
        <section key={week.id} className="rounded-[20px] bg-surface p-4">
          <h2 className="mb-2 font-condensed text-xl font-extrabold uppercase">
            Week {i + 1} · {formatDistance(weekTotals(week).km, units)}
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {DAYS.map((day) => {
              const workout = week.days[day - 1] ?? null;
              const label = WEEKDAY_LABELS[day];
              return (
                <li key={day} className="flex gap-3 py-2">
                  <span className="w-10 shrink-0 text-sm font-semibold text-muted uppercase">{label.short}</span>
                  {workout ? (
                    <details className="min-w-0 flex-1">
                      <summary className="cursor-pointer text-sm">
                        <span className="font-semibold">{workout.name}</span>{" "}
                        <span className="text-muted tabular-nums">{workoutSummary(workout, units)}</span>
                      </summary>
                      <div className="mt-2 flex flex-col gap-2">
                        <ul className="flex flex-col gap-1 text-sm">
                          {workout.steps.map((s, j) => (
                            <li key={j}>{describeStep(s, units)}</li>
                          ))}
                        </ul>
                        {workout.notes ? <p className="text-sm text-muted whitespace-pre-line">{workout.notes}</p> : null}
                        <StructureBar steps={workout.steps} units={units} size="sm" />
                      </div>
                    </details>
                  ) : (
                    <span className="text-sm text-muted">Rest</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
