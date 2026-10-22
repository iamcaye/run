import { expect, test } from "@playwright/test";

// Plan builder drag-and-drop is a desktop (lg+) affordance; the rest of the suite runs as a Pixel 7.
test.use({ viewport: { width: 1280, height: 800 } });

test("build, duplicate and activate a custom plan, then switch back to the goal", async ({ page }) => {
  const email = `e2e-plan-${Date.now()}@test.local`;
  const raceDate = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);

  // ── Sign up + onboarding with a goal ───────────────────────────────────────
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Plan Builder");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Your week" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "First goal" })).toBeVisible();
  await page.locator("input[name=name]").fill("Plan Half");
  await page.locator("input[name=raceDate]").fill(raceDate);
  await page.locator("select[name=distancePreset]").selectOption("half");
  await page.locator("select[name=goalType]").selectOption("target_time");
  await page.locator("input[name=targetTime]").fill("1:50:00");
  await page.locator("input[name=startWeeklyDistance]").fill("25");
  await page.locator("select[name=level]").selectOption("intermediate");
  await page.getByRole("button", { name: "Create goal & continue" }).click();
  await expect(page.getByRole("heading", { name: "Plan preview" })).toBeVisible();
  await page.getByRole("link", { name: "Continue →" }).click();
  await expect(page.getByRole("heading", { name: "Apple Watch sync" })).toBeVisible();
  await page.getByRole("button", { name: "Go to my dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // ── Workout editor: 6×1000 (defaults: warm-up 2 km, 6 × 1 km, 2:00 jog recovery, cool-down 2 km) ──
  await page.goto("/workouts/new");
  await page.getByLabel("Name", { exact: true }).fill("6×1000");
  const repeat = page.getByRole("region", { name: /Block 2: Repeat/ });
  await repeat.getByRole("radio", { name: "Pace" }).check({ force: true });
  const pace = repeat.getByRole("textbox", { name: "Pace" });
  await pace.fill("4:00");
  await pace.press("Enter");
  await expect(pace).toHaveValue("4:00");
  // 2 + 6 + 2 km plus five 2:00 jog recoveries at 7:00/km (the last rep has none) = 11.43 km.
  await expect(page.getByText(/≈ 11\.4 km/)).toBeVisible();
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page).toHaveURL(/\/workouts\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();

  // ── Plan: create "Base 10K" ────────────────────────────────────────────────
  await page.goto("/plans");
  await page.getByLabel("Plan name").fill("Base 10K");
  await page.getByRole("button", { name: "New plan", exact: true }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);

  // Drag the saved workout from My workouts onto Tuesday (HTML5 DnD; drop bubbles to the day cell).
  await page.locator("span[draggable=true]", { hasText: "6×1000" }).dragTo(page.getByRole("button", { name: "Add a workout on Tuesday" }));
  await expect(page.getByRole("button", { name: /6×1000/ })).toBeVisible();

  // An easy run on Thursday.
  await page.getByRole("button", { name: "Add a workout on Thursday" }).click();
  await expect(page.getByRole("button", { name: /Easy run/ })).toBeVisible();

  // ── Duplicate week 1 ───────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Duplicate week 1" }).click();
  const week1 = page.getByRole("button", { name: /^Week 1/ });
  const week2 = page.getByRole("button", { name: /^Week 2/ });
  await expect(week1).toBeVisible();
  await expect(week2).toBeVisible();
  const km = (s: string | null) => (s ?? "").replace(/^Week \d+/, "").trim();
  const km1 = km(await week1.textContent());
  expect(km1).not.toBe("");
  expect(km1).not.toMatch(/^0(\.0)?$/);
  expect(km(await week2.textContent())).toBe(km1);

  // ── Save, then activate on the current week so the dashboard is mid-plan ──
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Activate" }).click();
  const dialog = page.getByRole("dialog");
  const start = dialog.getByLabel("Start date");
  // `min` is today in the user's timezone: the Monday–Sunday week containing it is week 1.
  await start.fill((await start.getAttribute("min"))!);
  await dialog.getByRole("button", { name: "Activate" }).click();

  // ── Dashboard shows the plan hero ──────────────────────────────────────────
  await expect(page).toHaveURL(/\/plan$/);
  await page.goto("/dashboard");
  const hero = page.getByRole("region", { name: "Base 10K" });
  await expect(hero).toBeVisible();
  await expect(hero).toContainText(/Week\s*1\s*of 2/);

  // ── Goals: notice, then re-activate the goal ───────────────────────────────
  await page.goto("/goals");
  const notice = page.getByRole("status").filter({ hasText: "You're following" });
  await expect(notice).toContainText("Base 10K");
  await expect(notice).toContainText("Activating a goal will stop it.");
  await page.getByRole("button", { name: "Make active" }).first().click();
  await expect(notice).toBeHidden();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Plan Half" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Plan Half" })).toContainText(/\d+\s*Days?\s*to go/);
});
