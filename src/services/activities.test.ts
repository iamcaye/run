import { describe, expect, it } from "vitest";
import outdoorRun from "@/lib/import/__fixtures__/hae/provisional-v2-outdoor-run.json";
import { forUser } from "@/server/dal";
import { createTestUser, goalInput } from "@/test/factories";
import { deleteManualActivity, getActivityDetail, logManualRun } from "./activities";
import { createGoal } from "./goals";
import { ingestPayload } from "./health-import";
import { createImportToken } from "./import-tokens";

async function setup() {
  const scope = forUser(await createTestUser("acts"));
  const settings = await scope.settings.update({ maxHr: 190, restHr: 50 });
  return { scope, settings };
}

describe("manual runs", () => {
  it("are stored in the user's time zone and linked to that day's session", async () => {
    const { scope, settings } = await setup();
    const g = await createGoal(scope, { ...goalInput(), targetTimeSeconds: 6300, notes: null }, { settings, today: "2026-10-12" });
    if (!g.ok) throw new Error();
    const session = (await scope.sessions.listForGoal(g.value.id)).find((s) => s.type !== "rest");
    if (!session) throw new Error();

    const { activity, linked } = await logManualRun(scope, { date: session.date, time: "23:30", km: 6, seconds: 2100, rpe: 5, notes: "treadmill" }, settings);
    expect(linked).toBe(true);
    expect(activity).toMatchObject({ source: "manual", rpe: 5, notes: "treadmill", plannedSessionId: session.id });
    expect(activity.externalId).toMatch(/^manual:/);
    // 23:30 Madrid is 21:30 or 22:30 UTC, same calendar day locally.
    expect(activity.startAt.getUTCHours()).toBeGreaterThanOrEqual(21);
  });

  it("only manual runs can be deleted, and only by their owner", async () => {
    const { scope, settings } = await setup();
    const other = await setup();
    const { activity } = await logManualRun(scope, { date: "2026-10-10", time: "07:00", km: 5, seconds: 1700, rpe: 4, notes: null }, settings);
    expect(await deleteManualActivity(other.scope, activity.id)).toBe(false);
    expect(await scope.activities.get(activity.id)).not.toBeNull();

    const { summary: token } = await createImportToken(scope, "phone");
    const body = JSON.stringify(outdoorRun);
    await ingestPayload(scope, token.id, body, body.length);
    const imported = (await scope.activities.list()).find((a) => a.source === "healthkit");
    if (!imported) throw new Error();
    expect(await deleteManualActivity(scope, imported.id)).toBe(false);
    expect(await deleteManualActivity(scope, activity.id)).toBe(true);
  });
});

describe("activity detail", () => {
  it("includes route, splits and time in zones; hidden from other users", async () => {
    const { scope, settings } = await setup();
    const other = await setup();
    const { summary: token } = await createImportToken(scope, "phone");
    const body = JSON.stringify(outdoorRun);
    await ingestPayload(scope, token.id, body, body.length);
    const [a] = await scope.activities.list();
    if (!a) throw new Error();

    const detail = await getActivityDetail(scope, a.id, settings);
    expect(detail?.route).toHaveLength(4);
    expect(detail?.zones).toHaveLength(5);
    expect(detail?.timeInZones?.reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
    expect(await getActivityDetail(other.scope, a.id, other.settings)).toBeNull();
  });
});
