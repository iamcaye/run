import "server-only";
import {
  canAbandon,
  canActivate,
  canLogResult,
  goalChangesAffectingPlan,
  type GoalPlanFields,
} from "@/lib/goals/rules";
import type { LocalDate } from "@/lib/time";
import type { GoalFormValues } from "@/lib/validation/goal";
import type { Goal, UserScope } from "@/server/dal";

export type GoalResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "not_found" | "invalid_state"; message: string };

const notFound = { ok: false, code: "not_found", message: "Goal not found" } as const;
const invalid = (message: string) => ({ ok: false, code: "invalid_state", message }) as const;

/** The first goal a user creates becomes active automatically. */
export async function createGoal(
  scope: UserScope,
  values: GoalFormValues,
  opts: { makeActive?: boolean } = {},
): Promise<GoalResult<Goal>> {
  const created = await scope.goals.create(values);
  const hasActive = (await scope.goals.getActive()) !== null;
  if (opts.makeActive || !hasActive) {
    const active = await scope.goals.activate(created.id);
    if (active) return { ok: true, value: active };
  }
  return { ok: true, value: created };
}

export async function updateGoal(
  scope: UserScope,
  id: string,
  values: GoalFormValues,
): Promise<GoalResult<{ goal: Goal; planChanges: (keyof GoalPlanFields)[] }>> {
  const before = await scope.goals.get(id);
  if (!before) return notFound;
  const goal = await scope.goals.update(id, values);
  if (!goal) return notFound;
  const planChanges =
    goal.status === "active" || goal.status === "upcoming"
      ? goalChangesAffectingPlan(before, goal)
      : [];
  return { ok: true, value: { goal, planChanges } };
}

export async function activateGoal(scope: UserScope, id: string): Promise<GoalResult<Goal>> {
  const goal = await scope.goals.get(id);
  if (!goal) return notFound;
  if (!canActivate(goal)) return invalid("Only upcoming or abandoned goals can be made active");
  const active = await scope.goals.activate(id);
  return active ? { ok: true, value: active } : notFound;
}

export async function logResult(
  scope: UserScope,
  id: string,
  resultTimeSeconds: number,
  today: LocalDate,
): Promise<GoalResult<{ goal: Goal; nextActive: Goal | null }>> {
  const goal = await scope.goals.get(id);
  if (!goal) return notFound;
  if (!canLogResult(goal, today)) return invalid("A result can be logged from race day onwards");
  const updated = await scope.goals.setStatus(id, "completed", resultTimeSeconds);
  if (!updated) return notFound;
  const nextActive = goal.status === "active" ? await promoteNextGoal(scope, today) : null;
  return { ok: true, value: { goal: updated, nextActive } };
}

export async function abandonGoal(
  scope: UserScope,
  id: string,
  today: LocalDate,
): Promise<GoalResult<{ goal: Goal; nextActive: Goal | null }>> {
  const goal = await scope.goals.get(id);
  if (!goal) return notFound;
  if (!canAbandon(goal)) return invalid("This goal is already finished");
  const updated = await scope.goals.setStatus(id, "abandoned");
  if (!updated) return notFound;
  const nextActive = goal.status === "active" ? await promoteNextGoal(scope, today) : null;
  return { ok: true, value: { goal: updated, nextActive } };
}

export async function deleteGoal(
  scope: UserScope,
  id: string,
  today: LocalDate,
): Promise<GoalResult<{ nextActive: Goal | null }>> {
  const goal = await scope.goals.get(id);
  if (!goal) return notFound;
  await scope.goals.delete(id);
  const nextActive = goal.status === "active" ? await promoteNextGoal(scope, today) : null;
  return { ok: true, value: { nextActive } };
}

/** When the active goal ends, the soonest upcoming future goal takes over (if any). */
async function promoteNextGoal(scope: UserScope, today: LocalDate): Promise<Goal | null> {
  const next = (await scope.goals.list())
    .filter((g) => g.status === "upcoming" && g.raceDate > today)
    .sort((a, b) => a.raceDate.localeCompare(b.raceDate))[0];
  return next ? scope.goals.activate(next.id) : null;
}
