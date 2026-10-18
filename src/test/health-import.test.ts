import { describe, expect, it } from "vitest";
import { IMPORT } from "@/config/training";
import outdoorRun from "@/lib/import/__fixtures__/hae/provisional-v2-outdoor-run.json";
import mixed from "@/lib/import/__fixtures__/hae/provisional-v2-mixed.json";
import { POST } from "@/app/api/health-import/route";
import { forUser } from "@/server/dal";
import { createGoal } from "@/services/goals";
import { processRawImport, reprocessUser } from "@/services/health-import";
import { createImportToken } from "@/services/import-tokens";
import { createTestUser, goalInput } from "./factories";

const post = (token: string | null, body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost/api/health-import", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

async function userWithToken(label = "importer") {
  const userId = await createTestUser(label);
  const scope = forUser(userId);
  const { token, summary } = await createImportToken(scope, "iPhone");
  return { userId, scope, token, tokenId: summary.id };
}

describe("POST /api/health-import — auth", () => {
  it("rejects missing, malformed, unknown and revoked tokens with 401", async () => {
    const { scope, token, tokenId } = await userWithToken();
    expect((await post(null, outdoorRun)).status).toBe(401);
    expect((await post("not-a-token", outdoorRun)).status).toBe(401);
    expect((await post(`${IMPORT.tokenPrefix}unknown`, outdoorRun)).status).toBe(401);
    await scope.importTokens.revoke(tokenId);
    expect((await post(token, outdoorRun)).status).toBe(401);
    expect(await scope.activities.list()).toEqual([]);
  });

  it("stores only the token hash", async () => {
    const { scope, token } = await userWithToken();
    const [stored] = await scope.importTokens.list();
    expect(stored).toBeDefined();
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(token).toMatch(/^rtt_[A-Za-z0-9_-]{40,}$/);
  });
});

describe("POST /api/health-import — import", () => {
  it("imports runs with route and HR, stores the raw payload, records last use", async () => {
    const { scope, token } = await userWithToken();
    const res = await post(token, outdoorRun);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, workouts: 1, imported: 1, skipped: 0 });

    const [a] = await scope.activities.list();
    expect(a).toMatchObject({ externalId: "8F2C5B1E-6A3D-4E7B-9C1A-2D4F6B8E0A13", source: "healthkit", km: 8.12, seconds: 2790, avgHr: 149 });
    expect(a?.hrSeries).toHaveLength(4);
    expect(await scope.activities.routePoints(a?.id ?? "")).toHaveLength(4);

    const [raw] = await scope.rawImports.listRecent();
    expect(raw).toMatchObject({ status: "processed", error: null });
    expect(raw?.payloadBytes).toBeGreaterThan(100);
    expect((await scope.rawImports.get(raw?.id ?? ""))?.payload).toEqual(outdoorRun);
    expect((await scope.importTokens.list())[0]?.lastUsedAt).not.toBeNull();
  });

  it("is idempotent across overlapping re-sends and keeps user-entered RPE", async () => {
    const { scope, token } = await userWithToken();
    await post(token, mixed);
    const [first] = await scope.activities.list();
    if (!first) throw new Error();
    await scope.activities.update(first.id, { rpe: 6, notes: "felt good" });

    const res = await post(token, mixed);
    expect(await res.json()).toMatchObject({ imported: 2, skipped: 2, invalid: [expect.stringContaining("start date")] });
    const all = await scope.activities.list();
    expect(all).toHaveLength(2);
    expect(all.find((x) => x.id === first.id)).toMatchObject({ rpe: 6, notes: "felt good" });
    expect((await scope.rawImports.listRecent()).map((r) => r.status)).toEqual(["processed", "processed"]);
  });

  it("rejects invalid JSON and unexpected shapes with 400, recording them as failed", async () => {
    const { scope, token } = await userWithToken();
    expect((await post(token, "{nope")).status).toBe(400);
    const res = await post(token, { hello: "world" });
    expect(res.status).toBe(400);
    const failures = await scope.rawImports.listRecentErrors();
    expect(failures.map((f) => f.error)).toEqual([
      expect.stringContaining("Unexpected payload shape"),
      "Body is not valid JSON",
    ]);
    // The unexpected shape was still persisted as received.
    expect((await scope.rawImports.get(failures[0]?.id ?? ""))?.payload).toEqual({ hello: "world" });
  });

  it("answers 413 with a hint for oversized payloads and logs their size", async () => {
    const { scope, token } = await userWithToken();
    const byHeader = await post(token, outdoorRun, { "content-length": String(IMPORT.maxPayloadBytes + 1) });
    expect(byHeader.status).toBe(413);
    expect((await byHeader.json()).message).toMatch(/Batch requests/);

    const big = JSON.stringify({ data: { workouts: [], padding: "x".repeat(IMPORT.maxPayloadBytes) } });
    const byBody = await post(token, big);
    expect(byBody.status).toBe(413);

    const failures = await scope.rawImports.listRecentErrors();
    expect(failures).toHaveLength(2);
    expect(failures.every((f) => f.error === "Payload too large" && f.payloadBytes > IMPORT.maxPayloadBytes)).toBe(true);
  });

  it("rate-limits per token", async () => {
    const a = await userWithToken();
    const b = await userWithToken();
    for (let i = 0; i < IMPORT.rateLimit.maxRequests; i++) {
      expect((await post(a.token, "{}")).status).toBe(400);
    }
    const limited = await post(a.token, outdoorRun);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another token is unaffected.
    expect((await post(b.token, outdoorRun)).status).toBe(200);
  });
});

describe("tenancy", () => {
  it("a token only ever writes to its own user", async () => {
    const a = await userWithToken("tenant-a");
    const b = await userWithToken("tenant-b");
    await post(a.token, outdoorRun);
    expect(await a.scope.activities.list()).toHaveLength(1);
    expect(await b.scope.activities.list()).toEqual([]);
    expect(await b.scope.rawImports.listRecent()).toEqual([]);
    // Same workout sent with B's token becomes B's own, separate activity.
    await post(b.token, outdoorRun);
    const [aAct] = await a.scope.activities.list();
    const [bAct] = await b.scope.activities.list();
    expect(aAct?.id).not.toBe(bAct?.id);
    // B can't process A's stored payload.
    const [aRaw] = await a.scope.rawImports.listRecent();
    await expect(processRawImport(b.scope, aRaw?.id ?? "")).rejects.toThrow();
  });
});

describe("matching to planned sessions", () => {
  it("links a run to the active goal's session on the same local date, once", async () => {
    const { scope, token } = await userWithToken("matcher");
    const settings = await scope.settings.get(); // Europe/Madrid
    // Plan starting 2026-10-12 so it has a session around the fixture dates.
    const g = await createGoal(scope, { ...goalInput({ raceDate: "2027-03-07" }), targetTimeSeconds: 6300, notes: null }, { settings, today: "2026-10-12" });
    if (!g.ok) throw new Error();
    const sessions = await scope.sessions.listForGoal(g.value.id);
    const target = sessions.find((s) => s.date >= "2026-10-13" && s.type !== "rest");
    if (!target) throw new Error("no session");

    // Build a workout on that date, 07:30 local.
    const workout = { ...outdoorRun.data.workouts[0], id: "match-1", start: `${target.date} 07:30:00 +0200`, end: `${target.date} 08:15:00 +0200` };
    const res = await post(token, { data: { workouts: [workout, { ...workout, id: "match-2" }] } });
    expect(await res.json()).toMatchObject({ imported: 2, matched: 1 });

    const acts = await scope.activities.list();
    expect(acts.filter((a) => a.plannedSessionId === target.id)).toHaveLength(1);
    expect(acts.filter((a) => a.plannedSessionId === null)).toHaveLength(1);
  });

  it("reprocessing is idempotent", async () => {
    const { scope, token } = await userWithToken();
    await post(token, mixed);
    await post(token, outdoorRun);
    const before = (await scope.activities.list()).map((a) => a.id).sort();
    const r = await reprocessUser(scope);
    expect(r).toEqual({ total: 2, ok: 2, failed: 0 });
    expect((await scope.activities.list()).map((a) => a.id).sort()).toEqual(before);
  });
});
