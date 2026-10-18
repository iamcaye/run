import "server-only";
import { and, desc, eq, getTableColumns, isNull } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { importToken, rawImport } from "@/server/db/schema";
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
  return {
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
