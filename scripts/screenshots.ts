/**
 * Captures the landing-page screenshots from a running app signed in as the seeded demo users.
 *
 *   pnpm seed && pnpm dev
 *   pnpm screenshots [--base http://localhost:3000]
 *
 * Writes PNGs to src/assets/landing/ (imported by the landing page). Re-run after UI changes so the landing page stays truthful.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Locator, type Page } from "@playwright/test";

// Same as scripts/seed.ts (importing it would run the seed).
const DEMO_PASSWORD = "demo-password-123";
const DEMO_10K = "demo-10k@example.com";
const DEMO_HALF = "demo-half@example.com";

const baseIdx = process.argv.indexOf("--base");
const BASE = baseIdx > -1 ? process.argv[baseIdx + 1] : "http://localhost:3000";
const OUT = path.join(process.cwd(), "src", "assets", "landing");

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 } };

// The Next dev indicator, and (for element shots) the fixed bottom tab bar.
const HIDE_DEV = "nextjs-portal { display: none !important; }";
const HIDE_TAB_BAR = "nav.fixed.bottom-0 { display: none !important; }";

async function session(browser: Browser, email: string, device: typeof PHONE | typeof DESKTOP): Promise<Page> {
  const context = await browser.newContext({ ...device, deviceScaleFactor: 2, colorScheme: "light" });
  const page = await context.newPage();
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
  return page;
}

/** Navigates and waits for charts, fonts and map tiles to settle. */
async function visit(page: Page, route: string, css: string[] = []) {
  await page.goto(`${BASE}${route}`);
  await page.waitForLoadState("networkidle");
  for (const content of [HIDE_DEV, ...css]) await page.addStyleTag({ content });
  await page.waitForTimeout(800);
}

async function shoot(target: Page | Locator, name: string) {
  await target.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`✓ ${name}`);
}

/** The card (`section`) whose heading or chart caption matches. */
const card = (page: Page, title: RegExp) =>
  page
    .locator("section")
    .filter({ has: page.locator("h2, figcaption, figcaption > span:first-child").filter({ hasText: title }) })
    .last();

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  // The 10K user's load is in range, so their dashboard reads as a typical week.
  const tenK = await session(browser, DEMO_10K, PHONE);
  await visit(tenK, "/dashboard");
  await shoot(tenK, "phone-dashboard");

  const tenKDesktop = await session(browser, DEMO_10K, DESKTOP);
  await visit(tenKDesktop, "/dashboard");
  await shoot(tenKDesktop, "desktop-dashboard");

  // The half-marathon plan has every phase and structured quality sessions.
  const half = await session(browser, DEMO_HALF, PHONE);
  await visit(half, "/plan");
  await shoot(half, "phone-plan");
  // A quality session opened up: structure bar, target pace and steps.
  await half.addStyleTag({ content: HIDE_TAB_BAR });
  const quality = half.locator("details").filter({ hasText: "Quality" }).first();
  await quality.locator("summary").click();
  await shoot(quality, "card-session");

  await visit(half, "/log");
  await shoot(half, "phone-log");

  await visit(half, "/activities");
  const runHref = await half.locator('a[href^="/activities/"]').first().getAttribute("href");
  if (runHref) {
    await visit(half, runHref, [HIDE_TAB_BAR]);
    await half.waitForTimeout(1500); // map tiles
    await shoot(card(half, /route/i), "card-route");
    await shoot(card(half, /splits/i), "card-splits");
    await shoot(card(half, /heart rate$/i), "card-hr");
    await shoot(card(half, /zones/i), "card-zones");
  }

  const halfDesktop = await session(browser, DEMO_HALF, DESKTOP);
  await visit(halfDesktop, "/plan");
  await shoot(halfDesktop, "desktop-plan");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
