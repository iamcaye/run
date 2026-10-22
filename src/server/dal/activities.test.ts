import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { forUser, type UserScope } from "@/server/dal";
import { createTestUser, goalInput } from "@/test/factories";

function run(scope: UserScope, startAt: string) {
  return scope.activities.upsert({
    externalId: `hk-${randomUUID()}`,
    source: "healthkit",
    startAt: new Date(startAt),
    km: 5,
    seconds: 1800,
    avgHr: 145,
    maxHr: 160,
    rpe: null,
    hrSeries: [{ t: 0, bpm: 140 }],
    plannedSessionId: null,
    rawImportId: null,
    notes: null,
  });
}

const session = (date: string) => ({
  date,
  weekIndex: 0,
  phase: "base" as const,
  type: "easy" as const,
  targetKm: 5,
  targetPaceSecPerKm: 360,
  effortDescription: "Conversational",
  structure: null,
  isUserEdited: false,
});

describe("activities.sinceOrPlanStart", () => {
  it("reaches back to the day before the goal's first session when that is earlier", async () => {
    const scope = forUser(await createTestUser("since-plan"));
    const goal = await scope.goals.create(goalInput());
    await scope.sessions.createMany(goal.id, [session("2026-03-10"), session("2026-03-12")]);
    await run(scope, "2026-03-08T12:00:00Z"); // before the padded plan start
    const early = await run(scope, "2026-03-09T12:00:00Z"); // the padding day
    const late = await run(scope, "2026-06-01T12:00:00Z");

    const rows = await scope.activities.sinceOrPlanStart(new Date("2026-05-01T00:00:00Z"), { goalId: goal.id });
    expect(rows.map((r) => r.id)).toEqual([early.id, late.id]);
    expect(rows[0]).not.toHaveProperty("hrSeries");
  });

  it("uses `since` when it is earlier, or when the goal has no sessions", async () => {
    const scope = forUser(await createTestUser("since-floor"));
    const goal = await scope.goals.create(goalInput());
    await run(scope, "2026-03-01T12:00:00Z");
    const after = await run(scope, "2026-04-01T12:00:00Z");
    const since = new Date("2026-03-15T00:00:00Z");

    expect((await scope.activities.sinceOrPlanStart(since, { goalId: goal.id })).map((r) => r.id)).toEqual([after.id]);
    await scope.sessions.createMany(goal.id, [session("2026-05-01")]);
    expect((await scope.activities.sinceOrPlanStart(since, { goalId: goal.id })).map((r) => r.id)).toEqual([after.id]);
  });
});
