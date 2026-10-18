import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const baseURL = `http://localhost:${PORT}`;
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure", ...devices["Pixel 7"] },
  webServer: {
    // Production build against the test database (never the dev data).
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `${baseURL}/sign-in`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: databaseUrl, BETTER_AUTH_URL: baseURL },
  },
});
