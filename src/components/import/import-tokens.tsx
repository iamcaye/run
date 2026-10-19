"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Field, FormError, FormSuccess, SubmitButton } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { createImportTokenAction, revokeImportTokenAction } from "@/server/actions/import-tokens";
import { SetupGuide } from "./setup-guide";

export type TokenRow = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function ImportTokens({ tokens, endpoint }: { tokens: readonly TokenRow[]; endpoint: string }) {
  const { state, onSubmit, pending } = useFormAction(createImportTokenAction);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);
  const [revoking, startRevoke] = useTransition();
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const active = tokens.filter((t) => !t.revokedAt);

  return (
    <div className="flex flex-col gap-4">
      {active.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {active.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{t.name}</p>
                <p className="text-xs text-muted">
                  Created {fmt(t.createdAt)} · {t.lastUsedAt ? `last used ${fmt(t.lastUsedAt)}` : "never used"}
                </p>
              </div>
              <button
                type="button"
                disabled={revoking}
                className="shrink-0 text-sm text-danger disabled:opacity-60"
                onClick={() => {
                  if (!window.confirm(`Revoke “${t.name}”? Its automation will stop syncing.`)) return;
                  startRevoke(async () => {
                    const r = await revokeImportTokenAction(t.id);
                    setRevokeError(r.status === "error" ? (r.message ?? "Could not revoke") : null);
                  });
                }}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No active tokens. Create one for each phone that sends workouts.</p>
      )}
      <FormError>{revokeError}</FormError>

      <form ref={formRef} onSubmit={onSubmit} className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="New token for" name="name" placeholder="My iPhone" required error={state.fieldErrors?.name} />
        </div>
        <SubmitButton pending={pending} pendingLabel="Creating…" variant="ink">
          Create
        </SubmitButton>
      </form>
      <FormError>{state.status === "error" && !state.fieldErrors ? state.message : null}</FormError>

      {state.status === "success" && state.secret ? (
        <div className="flex flex-col gap-3 rounded-lg border border-accent/40 p-3">
          <FormSuccess>{state.message}</FormSuccess>
          <SetupGuide endpoint={endpoint} token={state.secret} />
        </div>
      ) : (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Setup guide</summary>
          <div className="mt-3">
            <SetupGuide endpoint={endpoint} />
          </div>
        </details>
      )}
    </div>
  );
}
