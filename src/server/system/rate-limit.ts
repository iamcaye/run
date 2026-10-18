import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { rateLimit } from "@/server/db/schema";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

/**
 * Fixed-window counter in Postgres, so the limit holds across serverless instances.
 * One atomic upsert per hit; old windows for the same key are pruned as we go.
 */
export async function hitRateLimit(
  key: string,
  { windowSeconds, maxRequests }: { windowSeconds: number; maxRequests: number },
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);

  const [row] = await db()
    .insert(rateLimit)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimit.key, rateLimit.windowStart],
      set: { count: sql`${rateLimit.count} + 1` },
    })
    .returning({ count: rateLimit.count });
  await db().delete(rateLimit).where(and(eq(rateLimit.key, key), lt(rateLimit.windowStart, windowStart)));

  const count = row?.count ?? maxRequests + 1;
  return {
    allowed: count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
    retryAfterSeconds: Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000),
  };
}
