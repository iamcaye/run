/**
 * Re-runs stored Health Auto Export payloads through the current mapping (idempotent).
 *   pnpm reprocess              # every user with stored imports
 *   pnpm reprocess --user <id>  # one user
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { closeDb } from "@/server/db/client";
import { forUser } from "@/server/dal";
import { listUserIdsWithRawImports } from "@/server/system/raw-imports";
import { reprocessUser } from "@/services/health-import";

async function main() {
  const { values } = parseArgs({ options: { user: { type: "string" } } });
  const userIds = values.user ? [values.user] : await listUserIdsWithRawImports();
  if (userIds.length === 0) console.info("No stored imports.");

  for (const userId of userIds) {
    const r = await reprocessUser(forUser(userId));
    console.info(`${userId}: ${r.total} payload(s), ${r.ok} ok, ${r.failed} failed`);
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
