import "server-only";
import type { ImportTokenSummary, UserScope } from "@/server/dal";
import { generateToken } from "@/server/system/import-tokens";

/** Creates a token; the plaintext is returned exactly once and never stored. */
export async function createImportToken(
  scope: UserScope,
  name: string,
): Promise<{ token: string; summary: ImportTokenSummary }> {
  const { token, hash } = generateToken();
  const summary = await scope.importTokens.create(name, hash);
  return { token, summary };
}
