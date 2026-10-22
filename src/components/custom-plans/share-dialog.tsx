"use client";

import { useRef, useState, useTransition } from "react";
import { Button, FormError } from "@/components/ui/form";
import { CopyField } from "@/components/ui/copy-field";
import { updatePlanShareAction } from "@/server/actions/custom-plans";

type ShareInfo = { shareUrl: string | null; enabled: boolean };

/** "Share" button plus a modal to create, disable or replace the plan's share link. */
export function ShareDialog({
  planId,
  initial,
  disabledReason,
}: {
  planId: string;
  initial: ShareInfo;
  /** Why sharing isn't possible right now (e.g. unsaved changes); null when it is. */
  disabledReason?: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [share, setShare] = useState<ShareInfo>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(op: "enable" | "disable" | "regenerate") {
    setError(null);
    startTransition(async () => {
      try {
        const res = await updatePlanShareAction(planId, op);
        if (res.status === "ok") setShare({ shareUrl: res.shareUrl, enabled: res.enabled });
        else setError(res.message);
      } catch {
        setError("Something went wrong. Try again.");
      }
    });
  }

  const live = share.enabled && share.shareUrl !== null;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => ref.current?.showModal()}
        disabled={Boolean(disabledReason)}
        title={disabledReason ?? undefined}
      >
        Share
      </Button>
      <dialog
        ref={ref}
        aria-labelledby="share-heading"
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-[20px] bg-surface p-5 text-foreground backdrop:bg-foreground/40"
      >
        <div className="flex flex-col gap-4">
          <h2 id="share-heading" className="font-condensed text-2xl font-extrabold uppercase">
            Share plan
          </h2>
          {live ? (
            <>
              <CopyField label="Share link" value={share.shareUrl!} />
              <p className="text-sm text-muted">Followers get your saved changes to their upcoming sessions.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={pending} onClick={() => run("disable")}>
                  Disable link
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    if (confirm("The current link will stop working. Continue?")) run("regenerate");
                  }}
                >
                  New link
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm">Anyone with the link can view this plan and follow it.</p>
              <div>
                <Button type="button" disabled={pending} onClick={() => run("enable")}>
                  {share.shareUrl ? "Enable link" : "Create link"}
                </Button>
              </div>
            </>
          )}
          {error ? <FormError>{error}</FormError> : null}
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => ref.current?.close()}>
              Close
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
