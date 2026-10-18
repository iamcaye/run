import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/config/env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: Db; __sql?: postgres.Sql };

function create(): Db {
  // `prepare: false` keeps us compatible with transaction-mode poolers (Neon/Supabase).
  const sql = postgres(env().DATABASE_URL, { prepare: false, max: 10 });
  globalForDb.__sql = sql;
  return drizzle(sql, { schema, casing: "snake_case" });
}

/**
 * Raw database handle. Only `server/dal`, `server/system`, `services` and scripts may import this
 * (enforced by ESLint) — everything else goes through `forUser(userId)`.
 */
export function db(): Db {
  globalForDb.__db ??= create();
  return globalForDb.__db;
}

export async function closeDb(): Promise<void> {
  await globalForDb.__sql?.end();
  globalForDb.__db = undefined;
  globalForDb.__sql = undefined;
}
