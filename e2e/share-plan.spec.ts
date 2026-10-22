import { expect, test, type Page } from "@playwright/test";

// Plan builder is a desktop (lg+) affordance; the rest of the suite runs as a Pixel 7.
test.use({ viewport: { width: 1280, height: 800 } });

const PASSWORD = "e2e-password-123";

async function signUp(page: Page, name: string, email: string, url = "/sign-up") {
  await page.goto(url);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  const heading = page.getByRole("heading", { name: "Your week" });
  // Better Auth rate-limits sign-ups per IP (3 per 10 s); the suite's other sign-ups can be just ahead of us.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole("button", { name: "Create account" }).click();
    const limited = page.getByText("Too many requests");
    await expect(heading.or(limited)).toBeVisible();
    if (await heading.isVisible()) return;
    await page.waitForTimeout(10_000);
  }
  await expect(heading).toBeVisible();
}

test("share a plan, follow it via sign-up, receive an update, disable the link and duplicate", async ({ page, browser }) => {
  const stamp = Date.now();
  const authorEmail = `e2e-author-${stamp}@test.local`;
  const followerEmail = `e2e-follower-${stamp}@test.local`;
  const raceDate = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);

  // ── 1. Author: onboarding, then build, save and share "Shared 10K" ────────
  await signUp(page, "Alice Author", authorEmail);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "First goal" })).toBeVisible();
  await page.locator("input[name=name]").fill("Author Half");
  await page.locator("input[name=raceDate]").fill(raceDate);
  await page.locator("select[name=distancePreset]").selectOption("half");
  await page.locator("select[name=goalType]").selectOption("target_time");
  await page.locator("input[name=targetTime]").fill("1:50:00");
  await page.locator("input[name=startWeeklyDistance]").fill("25");
  await page.locator("select[name=level]").selectOption("intermediate");
  await page.getByRole("button", { name: "Create goal & continue" }).click();
  await expect(page.getByRole("heading", { name: "Plan preview" })).toBeVisible();
  await page.getByRole("link", { name: "Continue →" }).click();
  await page.getByRole("button", { name: "Go to my dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/plans");
  await page.getByLabel("Plan name").fill("Shared 10K");
  await page.getByRole("button", { name: "New plan", exact: true }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);
  const builderUrl = page.url();
  await page.getByRole("button", { name: "Add a workout on Tuesday" }).click();
  await expect(page.getByRole("button", { name: /Easy run/ })).toBeVisible();
  await page.getByRole("button", { name: "Add a workout on Thursday" }).click();
  await expect(page.getByRole("button", { name: /Easy run/ })).toHaveCount(2);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Share", exact: true }).click();
  const shareDialog = page.getByRole("dialog");
  await shareDialog.getByRole("button", { name: "Create link" }).click();
  await expect(shareDialog.getByRole("button", { name: "Disable link" })).toBeVisible();
  const shareUrl = (await shareDialog.locator("code").textContent())!.trim();
  expect(shareUrl).toMatch(/\/p\/[A-Za-z0-9_-]+$/);
  const path = new URL(shareUrl).pathname;
  await shareDialog.getByRole("button", { name: "Close" }).click();

  // ── 2. Logged-out visitor sees the public page, then follows via sign-up ──
  const followerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const follower = await followerCtx.newPage();
  await follower.goto(path);
  await expect(follower.getByText("Shared 10K").first()).toBeVisible();
  await expect(follower.getByText("by Alice Author")).toBeVisible();
  expect(await follower.content()).not.toContain(authorEmail);
  await follower.getByRole("link", { name: "Follow this plan" }).click();
  await expect(follower).toHaveURL(/\/sign-up/);
  await signUp(follower, "Fiona Follower", followerEmail, follower.url());
  await follower.getByRole("button", { name: "Continue" }).click();
  await expect(follower.getByRole("heading", { name: "Start this plan" })).toBeVisible();
  const start = follower.getByLabel("Start date");
  await start.fill((await start.getAttribute("min"))!); // today
  await follower.getByRole("button", { name: "Follow plan" }).click();
  await expect(follower.getByRole("heading", { name: "Plan preview" })).toBeVisible();
  await follower.getByRole("link", { name: "Continue →" }).click();
  await expect(follower.getByRole("heading", { name: "Apple Watch sync" })).toBeVisible();
  await follower.getByRole("button", { name: "Go to my dashboard" }).click();
  await expect(follower).toHaveURL(/\/dashboard/);
  await expect(follower.getByRole("region", { name: "Shared 10K" })).toBeVisible();

  // ── 3. Author edits Thursday to 10 km; follower sees the notice ───────────
  await page.goto(builderUrl);
  await page.getByRole("button", { name: /Easy run/ }).nth(1).click();
  const distance = page.getByRole("complementary").getByRole("textbox", { name: /distance/i }).first();
  await distance.fill("10");
  await distance.press("Enter");
  await expect(distance).toHaveValue("10");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await follower.goto("/dashboard");
  await expect(follower.getByText(/updated your plan/)).toBeVisible();
  await follower.getByRole("button", { name: "Dismiss" }).click();
  await expect(follower.getByText(/updated your plan/)).toBeHidden();

  // ── 4. Author disables the link; it dies for visitors, the follow stays ──
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Disable link" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Enable link" })).toBeVisible();

  const thirdCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const third = await thirdCtx.newPage();
  await third.goto(path);
  await expect(third.getByRole("heading", { name: "Link no longer active" })).toBeVisible();
  await thirdCtx.close();

  await follower.goto("/plans");
  const shared = follower.locator("section", { has: follower.getByRole("heading", { name: "Shared with me" }) });
  await expect(shared).toContainText("Shared 10K");

  // ── 5. Follower duplicates it into an editable copy ───────────────────────
  await shared.getByRole("link", { name: /Shared 10K/ }).click();
  await follower.getByRole("button", { name: "Duplicate" }).click();
  await expect(follower).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);
  await expect(follower.getByLabel("Plan name")).toHaveValue("Shared 10K (copy)");
  await followerCtx.close();
});
