import { timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";
import { runDueAdaptations } from "@/services/weekly-adaptation";

export const maxDuration = 300;

function authorized(header: string | null): boolean {
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Vercel Cron → `GET /api/cron/adapt-plans` with `Authorization: Bearer ${CRON_SECRET}`.
 * Safe to call any time: users whose week hasn't closed, or who already have a run, are skipped.
 */
export async function GET(request: Request): Promise<Response> {
  if (!authorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await runDueAdaptations();
  return Response.json(summary);
}
