import { expect, test } from "@playwright/test";
import { backdatePlan, firstSessions, testDb } from "./db";

/**
 * The critical path: sign up → onboarding (settings, goal, plan preview, import token) →
 * Health Auto Export import → dashboard → weekly adjustment accepted.
 */
test("sign up to accepted plan adjustment", async ({ page, request }) => {
  const email = `e2e-${Date.now()}@test.local`;
  const raceDate = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);

  // ── Sign up ────────────────────────────────────────────────────────────────
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E Runner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();

  // ── Onboarding: your week (defaults: Tue/Thu/Sat/Sun, long run Sunday) ───
  await expect(page.getByRole("heading", { name: "Your week" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // ── First goal ─────────────────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: "First goal" })).toBeVisible();
  await page.locator("input[name=name]").fill("E2E Half");
  await page.locator("input[name=raceDate]").fill(raceDate);
  // A <select> inside its <label> folds its current value into the accessible name, so select by name.
  await page.locator("select[name=distancePreset]").selectOption("half");
  await page.locator("select[name=goalType]").selectOption("target_time");
  await page.locator("input[name=targetTime]").fill("1:50:00");
  await page.locator("input[name=startWeeklyDistance]").fill("25");
  await page.locator("select[name=level]").selectOption("intermediate");
  await page.getByRole("button", { name: "Create goal & continue" }).click();

  // ── Plan preview ───────────────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: "Plan preview" })).toBeVisible();
  await expect(page.getByText(/\d+ weeks · \d+ sessions/)).toBeVisible();
  await page.getByRole("link", { name: "Continue →" }).click();

  // ── Import token ───────────────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: "Apple Watch sync" })).toBeVisible();
  await page.getByLabel("New token for").fill("E2E iPhone");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const header = page.locator("code", { hasText: "Authorization: Bearer rtt_" });
  await expect(header).toBeVisible();
  const token = (await header.textContent())?.replace("Authorization: Bearer ", "").trim() ?? "";
  expect(token).toMatch(/^rtt_/);
  await page.getByRole("button", { name: "Go to my dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // ── Arrange: pretend the plan started 5 weeks ago (DB), runs synced only in week 1 ──
  const sql = testDb();
  try {
    await backdatePlan(sql, email, 35);
    const early = await firstSessions(sql, email, 2);
    expect(early.length).toBe(2);

    // ── Import through the real endpoint, as Health Auto Export would ───────
    const workouts = early.map((s, i) => ({
      id: `e2e-run-${i}`,
      name: "Outdoor Run",
      start: `${s.date} 07:30:00 +0000`,
      end: `${s.date} 08:10:00 +0000`,
      duration: Math.round(s.target_km * 330),
      distance: { qty: s.target_km, units: "km" },
      avgHeartRate: { qty: 148, units: "bpm" },
    }));
    const res = await request.post("/api/health-import", {
      headers: { authorization: `Bearer ${token}` },
      data: { data: { workouts } },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ imported: 2, matched: 2 });
  } finally {
    await sql.end();
  }

  // ── Dashboard: the weekly check-in runs on load and proposes easing back in ─
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "E2E Half" })).toBeVisible();
  const proposal = page.locator("article", { hasText: "Easing back in after a break" });
  await expect(proposal).toBeVisible();
  await expect(proposal).toContainText(/haven't run for \d+ days/);

  // ── Accept ─────────────────────────────────────────────────────────────────
  await proposal.getByRole("button", { name: "Apply changes" }).click();
  await expect(proposal.getByRole("status")).toContainText(/Applied \d+ changes?/);

  // The plan history records it.
  await page.goto("/plan");
  await expect(page.locator("article", { hasText: "Easing back in after a break" })).toContainText("Accepted");

  // ── Quick log: rate the latest run ─────────────────────────────────────────
  await page.goto("/log");
  await page.locator("label", { hasText: "Comfortable" }).first().click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("RPE 4");
});

test("bad tokens, missing cron secret and signed-out visits are rejected", async ({ page, request }) => {
  const res = await request.post("/api/health-import", { headers: { authorization: "Bearer rtt_nope" }, data: {} });
  expect(res.status()).toBe(401);
  const cron = await request.get("/api/cron/adapt-plans");
  expect(cron.status()).toBe(401);
  // Signed out → sent to sign-in.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
});
