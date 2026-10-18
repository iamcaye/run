import type { ReactNode } from "react";

/** Hero number + label + context line. */
export function StatTile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-surface p-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="truncate text-2xl font-semibold tabular-nums">{value}</span>
      {detail ? <span className="text-xs text-muted">{detail}</span> : null}
    </div>
  );
}
