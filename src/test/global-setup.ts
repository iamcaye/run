import "dotenv/config";
import { runMigrations } from "../../scripts/migrate";

export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  await runMigrations(url);
}
