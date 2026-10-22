import { randomUUID } from "node:crypto";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { forUser, type GoalInput } from "@/server/dal";

/** Inserts a bare user row (bypasses Better Auth; fine for DAL tests). */
export async function createTestUser(label = "user"): Promise<string> {
  const id = randomUUID();
  await db()
    .insert(user)
    .values({ id, name: label, email: `${label}-${id}@test.local` });
  return id;
}

export function goalInput(overrides: Partial<GoalInput> = {}): GoalInput {
  return {
    name: "Spring Half",
    raceDate: "2027-03-14",
    distanceKm: 21.0975,
    goalType: "target_time",
    targetTimeSeconds: 6300,
    startWeeklyKm: 25,
    level: "intermediate",
    notes: null,
    ...overrides,
  };
}

/** A user with one of every kind of owned row, for tenancy and cascade tests. */
export async function createPopulatedUser(label: string) {
  const userId = await createTestUser(label);
  const scope = forUser(userId);
  const goal = await scope.goals.create(goalInput());
  await scope.goals.activate(goal.id);
  const [session] = await scope.sessions.createMany(goal.id, [
    {
      date: "2026-11-01",
      weekIndex: 0,
      phase: "base",
      type: "easy",
      targetKm: 6,
      targetPaceSecPerKm: 360,
      effortDescription: "Conversational",
      structure: null,
      isUserEdited: false,
    },
  ]);
  if (!session) throw new Error("no session");
  const activity = await scope.activities.upsert({
    externalId: `hk-${randomUUID()}`,
    source: "healthkit",
    startAt: new Date("2026-11-01T08:00:00Z"),
    km: 6.1,
    seconds: 2200,
    avgHr: 145,
    maxHr: 160,
    rpe: null,
    hrSeries: null,
    plannedSessionId: session.id,
    rawImportId: null,
    notes: null,
  });
  await scope.activities.replaceRoute(activity.id, [
    { idx: 0, lat: 40.4, lon: -3.7, altitude: 650, timestamp: new Date("2026-11-01T08:00:00Z") },
    { idx: 1, lat: 40.401, lon: -3.701, altitude: 651, timestamp: new Date("2026-11-01T08:00:10Z") },
  ]);
  const token = await scope.importTokens.create("iPhone", `hash-${randomUUID()}`);
  const adjustment = await scope.adjustments.create({
    goalId: goal.id,
    runWeekStart: "2026-11-02",
    rule: "acwr_high",
    reason: "Load spiked",
    changes: [],
  });
  const workout = await scope.workouts.create({ name: "Tempo", type: "tempo", notes: null, steps: [] });
  const created = await scope.customPlans.create({ name: "My plan", description: null });
  const plan = await scope.customPlans.save(
    created.id,
    { name: "My plan", description: null, doc: { weeks: [] } },
    created.version,
  );
  if (!plan || plan === "conflict") throw new Error("plan save failed");
  const follow = await scope.planFollows.upsertForPlan(plan);
  await scope.sessions.replace({ followId: follow.id }, [], [
    {
      date: "2026-11-03",
      weekIndex: 0,
      phase: null,
      type: "easy",
      targetKm: 5,
      targetPaceSecPerKm: null,
      effortDescription: "Easy",
      structure: null,
      isUserEdited: false,
      sourceKey: "w1:2",
    },
  ]);
  const [followSession] = await scope.sessions.listFor({ followId: follow.id });
  if (!followSession) throw new Error("no follow session");
  return { userId, scope, goal, session, activity, token, adjustment, workout, plan, follow, followSession };
}
