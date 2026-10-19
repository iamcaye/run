import { describe, expect, it } from "vitest";
import { forUser } from "@/server/dal";
import { createTestUser, goalInput } from "@/test/factories";
import { createGoal } from "./goals";
import { getPlanCalendar } from "./plan-calendar";

const planToday = "2026-10-19";
const viewToday = "2026-10-31";
const month = "2026-10";

async function userWithPlan(label: string) {
  const scope = forUser(await createTestUser(label));
  const settings = await scope.settings.get();
  const created = await createGoal(scope, { ...goalInput(), targetTimeSeconds: 6300, notes: null }, { settings, today: planToday });
  if (!created.ok) throw new Error("goal");
  const sessions = await scope.sessions.listForGoal(created.value.id);
  return { scope, settings, sessions };
}

const run = (externalId: string, startAt: string, plannedSessionId: string | null = null) => ({
  externalId,
  source: "healthkit" as const,
  startAt: new Date(startAt),
  km: 8,
  seconds: 2900,
  avgHr: null,
  maxHr: null,
  rpe: null,
  hrSeries: null,
  plannedSessionId,
  rawImportId: null,
  notes: null,
});

const allDays = (grid: Awaited<ReturnType<typeof getPlanCalendar>>) => grid.weeks.flatMap((w) => w.days);

describe("getPlanCalendar", () => {
  it("marks a session done when an activity is linked to it", async () => {
    const { scope, settings, sessions } = await userWithPlan("cal-linked");
    const target = sessions.find((s) => s.date > planToday && s.date < viewToday && s.type !== "rest");
    if (!target) throw new Error("fixture");
    await scope.activities.upsert(run("cal-1", `${target.date}T07:00:00Z`, target.id));

    const grid = await getPlanCalendar(scope, settings, sessions, month, viewToday);
    const day = allDays(grid).find((d) => d.date === target.date);
    expect(day?.sessions.find((s) => s.id === target.id)?.status).toBe("done");
  });

  it("lists an unlinked activity under unlinkedRuns", async () => {
    const { scope, settings, sessions } = await userWithPlan("cal-unlinked");
    const planned = new Set(sessions.map((s) => s.date));
    const date = "2026-10-12"; // before the plan starts, so no session
    expect(planned.has(date)).toBe(false);
    const act = await scope.activities.upsert(run("cal-2", `${date}T07:00:00Z`));

    const grid = await getPlanCalendar(scope, settings, sessions, month, viewToday);
    expect(allDays(grid).find((d) => d.date === date)?.unlinkedRuns).toEqual([{ id: act.id, km: 8 }]);
  });

  it("places activities by the user's local date", async () => {
    const { scope, sessions } = await userWithPlan("cal-tz");
    await scope.settings.update({ timezone: "Pacific/Auckland" });
    const tzSettings = await scope.settings.get();
    const act = await scope.activities.upsert(run("cal-3", "2026-10-14T12:00:00Z"));

    const grid = await getPlanCalendar(scope, tzSettings, sessions, month, viewToday);
    const days = allDays(grid);
    expect(days.find((d) => d.date === "2026-10-15")?.unlinkedRuns.map((r) => r.id)).toContain(act.id);
    expect(days.find((d) => d.date === "2026-10-14")?.unlinkedRuns.map((r) => r.id) ?? []).not.toContain(act.id);
  });

  it("does not show another user's activities", async () => {
    const { scope, settings, sessions } = await userWithPlan("cal-mine");
    const other = forUser(await createTestUser("cal-other"));
    await other.activities.upsert(run("cal-4", "2026-10-12T07:00:00Z"));

    const grid = await getPlanCalendar(scope, settings, sessions, month, viewToday);
    expect(allDays(grid).flatMap((d) => d.unlinkedRuns)).toEqual([]);
  });
});
