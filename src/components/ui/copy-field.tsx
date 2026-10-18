"use client";

import { useState } from "react";

/** Read-only value with a copy button (falls back to selecting the text). */
export function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <div className="flex min-w-0 items-stretch gap-2">
        <code
          className={`min-w-0 flex-1 overflow-x-auto rounded-lg border px-3 py-2 font-mono text-xs whitespace-nowrap ${secret ? "border-accent bg-accent/10" : "border-border bg-background"}`}
        >
          {value}
        </code>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-border bg-surface px-3 text-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
