import { daysBetween, type LocalDate } from "@/lib/time";
import { formatDistance, formatDuration, toDisplayDistance, type Units } from "@/lib/units";

/** "10 km" rather than "10.0 km", but "6.2 mi" for the same race. */
const wholeInUnits = (km: number, units: Units) => Number.isInteger(Number(toDisplayDistance(km, units).toFixed(1)));
import type { Goal } from "@/server/dal";

const STATUS_STYLES: Record<Goal["status"], string> = {
  active: "bg-accent text-accent-foreground",
  upcoming: "border border-border text-muted",
  completed: "bg-foreground/10",
  abandoned: "border border-border text-muted line-through",
};

export function StatusBadge({ status }: { status: Goal["status"] }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase ${STATUS_STYLES[status]}`}>{status}</span>;
}

export function formatRaceDate(date: LocalDate): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** One-line facts about a goal: distance · date · target/result · countdown. */
export function GoalFacts({ goal, units, today }: { goal: Goal; units: Units; today: LocalDate }) {
  const days = daysBetween(today, goal.raceDate);
  const parts = [
    formatDistance(goal.distanceKm, units, wholeInUnits(goal.distanceKm, units) ? 0 : 1),
    formatRaceDate(goal.raceDate),
    goal.resultTimeSeconds
      ? `finished in ${formatDuration(goal.resultTimeSeconds)}`
      : goal.targetTimeSeconds
        ? `target ${formatDuration(goal.targetTimeSeconds)}`
        : "finish goal",
  ];
  if (goal.status === "active" || goal.status === "upcoming") {
    parts.push(days > 0 ? `in ${days} day${days === 1 ? "" : "s"}` : days === 0 ? "race day!" : "race day passed");
  }
  return <p className="text-sm text-muted">{parts.join(" · ")}</p>;
}
