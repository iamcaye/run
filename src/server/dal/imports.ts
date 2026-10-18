import "server-only";
import { and, asc, desc, eq, getTableColumns, isNotNull, isNull, max, or } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { importToken, rawImport } from "@/server/db/schema";
import { assertOwnsToken } from "./ownership";
import type { ImportTokenSummary, RawImport, RawImportSummary } from "./types";

const { tokenHash: _hash, ...tokenSummaryColumns } = getTableColumns(importToken);
const { payload: _payload, ...rawSummaryColumns } = getTableColumns(rawImport);

export function importTokensRepo(d: Db, userId: string) {
  const owned = (id: string) => and(eq(importToken.id, id), eq(importToken.userId, userId));

  return {
    list(): Promise<ImportTokenSummary[]> {
      return d
        .select(tokenSummaryColumns)
        .from(importToken)
        .where(eq(importToken.userId, userId))
        .orderBy(desc(importToken.createdAt));
    },

    /** The caller generates the token and passes only its hash. */
    async create(name: string, tokenHash: string): Promise<ImportTokenSummary> {
      const [row] = await d
        .insert(importToken)
        .values({ userId, name, tokenHash })
        .returning(tokenSummaryColumns);
      if (!row) throw new Error("Failed to create token");
      return row;
    },

    async revoke(id: string): Promise<ImportTokenSummary | null> {
      const [row] = await d
        .update(importToken)
        .set({ revokedAt: new Date() })
        .where(and(owned(id), isNull(importToken.revokedAt)))
        .returning(tokenSummaryColumns);
      return row ?? null;
    },
  };
}

export function rawImportsRepo(d: Db, userId: string) {
  const owned = (id: string) => and(eq(rawImport.id, id), eq(rawImport.userId, userId));

  return {
    /** Stores a payload exactly as received, before any parsing. */
    async create(input: {
      tokenId: string | null;
      payloadBytes: number;
      payload: unknown;
      status?: "pending" | "failed";
      error?: string | null;
    }): Promise<RawImportSummary> {
      if (input.tokenId) await assertOwnsToken(d, userId, input.tokenId);
      const [row] = await d
        .insert(rawImport)
        .values({
          userId,
          tokenId: input.tokenId,
          payloadBytes: input.payloadBytes,
          payload: input.payload ?? null,
          status: input.status ?? "pending",
          error: input.error ?? null,
          processedAt: input.status === "failed" ? new Date() : null,
        })
        .returning(rawSummaryColumns);
      if (!row) throw new Error("Failed to store raw import");
      return row;
    },

    async markResult(id: string, result: { status: "processed" | "failed"; error?: string | null }): Promise<void> {
      await d
        .update(rawImport)
        .set({ status: result.status, error: result.error ?? null, processedAt: new Date() })
        .where(owned(id));
    },

    /** Oldest first, for reprocessing. */
    async listIds(): Promise<string[]> {
      const rows = await d
        .select({ id: rawImport.id })
        .from(rawImport)
        .where(and(eq(rawImport.userId, userId), isNotNull(rawImport.payload)))
        .orderBy(asc(rawImport.receivedAt));
      return rows.map((r) => r.id);
    },

    async lastProcessedAt(): Promise<Date | null> {
      const [row] = await d
        .select({ at: max(rawImport.processedAt) })
        .from(rawImport)
        .where(and(eq(rawImport.userId, userId), eq(rawImport.status, "processed")));
      return row?.at ?? null;
    },

    /** Failed imports and processed ones that skipped unreadable workouts. */
    listRecentErrors(limit = 5): Promise<RawImportSummary[]> {
      return d
        .select(rawSummaryColumns)
        .from(rawImport)
        .where(and(eq(rawImport.userId, userId), or(eq(rawImport.status, "failed"), isNotNull(rawImport.error))))
        .orderBy(desc(rawImport.receivedAt))
        .limit(limit);
    },

    listRecent(limit = 20): Promise<RawImportSummary[]> {
      return d
        .select(rawSummaryColumns)
        .from(rawImport)
        .where(eq(rawImport.userId, userId))
        .orderBy(desc(rawImport.receivedAt))
        .limit(limit);
    },

    async get(id: string): Promise<RawImport | null> {
      const [row] = await d
        .select()
        .from(rawImport)
        .where(and(eq(rawImport.id, id), eq(rawImport.userId, userId)));
      return row ?? null;
    },
  };
}
