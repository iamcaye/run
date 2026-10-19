import { expect, test } from "@playwright/test";

// Desktop viewport (the rest of the suite runs as a Pixel 7).
test.use({ viewport: { width: 1440, height: 900 } });

test("desktop plan calendar links through to a session", async ({ page }) => {
  const email = `e2e-desktop-${Date.now()}@test.local`;
  const raceDate = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Desktop Runner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Your week" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "First goal" })).toBeVisible();
  await page.locator("input[name=name]").fill("Desktop Half");
  await page.locator("input[name=raceDate]").fill(raceDate);
  await page.locator("select[name=distancePreset]").selectOption("half");
  await page.locator("select[name=goalType]").selectOption("target_time");
  await page.locator("input[name=targetTime]").fill("1:50:00");
  await page.locator("input[name=startWeeklyDistance]").fill("25");
  await page.locator("select[name=level]").selectOption("intermediate");
  await page.getByRole("button", { name: "Create goal & continue" }).click();
  await expect(page.getByRole("heading", { name: "Plan preview" })).toBeVisible();

  await page.goto("/plan");
  const calendar = page.getByRole("region", { name: "Month calendar" });
  await expect(calendar).toBeVisible();
  await expect(calendar.getByRole("heading", { level: 2 })).toHaveText(/\w+ \d{4}/);

  await calendar.locator('a[href^="/plan/sessions/"]').first().click();
  await expect(page).toHaveURL(/\/plan\/sessions\//);
});
