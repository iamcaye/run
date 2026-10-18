import "dotenv/config";
import { afterAll } from "vitest";
import { closeDb } from "@/server/db/client";

// Point the app's db() at the test database before anything connects.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL is not set");
process.env.DATABASE_URL = testUrl;

afterAll(async () => {
  await closeDb();
});
