import "server-only";
import { eq } from "drizzle-orm";
import { db, type Db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { activitiesRepo } from "./activities";
import { adjustmentRunsRepo, adjustmentsRepo } from "./adjustments";
import { goalsRepo } from "./goals";
import { importTokensRepo, rawImportsRepo } from "./imports";
import { profileRepo } from "./profile";
import { sessionsRepo } from "./sessions";
import { settingsRepo } from "./settings";

export { NotOwnedError } from "./ownership";
export type * from "./types";

/**
 * The only way to read or write user data. Every query inside is scoped to `userId`;
 * reads of rows owned by someone else return null/empty, never the row.
 */
export function forUser(userId: string, database: Db = db()) {
  if (!userId) throw new Error("forUser() requires a userId");
  return {
    userId,
    profile: profileRepo(database, userId),
    settings: settingsRepo(database, userId),
    goals: goalsRepo(database, userId),
    sessions: sessionsRepo(database, userId),
    activities: activitiesRepo(database, userId),
    importTokens: importTokensRepo(database, userId),
    rawImports: rawImportsRepo(database, userId),
    adjustments: adjustmentsRepo(database, userId),
    adjustmentRuns: adjustmentRunsRepo(database, userId),
    /** Deletes the user; FKs cascade to every user-owned table, including raw imports. */
    async deleteAccount(): Promise<void> {
      await database.delete(user).where(eq(user.id, userId));
    },
  };
}

export type UserScope = ReturnType<typeof forUser>;
