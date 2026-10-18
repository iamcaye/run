import { env } from "@/config/env";
import type { UserScope } from "@/server/dal";
import { ImportTokens } from "./import-tokens";

const fmt = (d: Date) =>
  d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Tokens, setup guide and sync status (Settings + onboarding). */
export async function ImportSection({ scope, showStatus = true }: { scope: UserScope; showStatus?: boolean }) {
  const [tokens, lastSync, failures] = await Promise.all([
    scope.importTokens.list(),
    scope.rawImports.lastProcessedAt(),
    scope.rawImports.listRecentErrors(5),
  ]);
  const endpoint = `${env().BETTER_AUTH_URL.replace(/\/$/, "")}/api/health-import`;

  return (
    <div className="flex flex-col gap-4">
      {showStatus ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Last sync: <strong>{lastSync ? fmt(lastSync) : "never"}</strong>
          </p>
          {failures.length > 0 ? (
            <div>
              <p className="font-medium">Recent import errors</p>
              <ul className="mt-1 flex flex-col gap-1">
                {failures.map((f) => (
                  <li key={f.id} className="text-xs">
                    <span className="text-muted">{fmt(f.receivedAt)}</span> — <span className="text-danger">
                      {f.status === "processed" ? "Partly imported: " : ""}
                      {f.error}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <ImportTokens
        endpoint={endpoint}
        tokens={tokens.map((t) => ({
          id: t.id,
          name: t.name,
          createdAt: t.createdAt.toISOString(),
          lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
          revokedAt: t.revokedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
