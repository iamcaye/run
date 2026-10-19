import type { ReactNode } from "react";

/** Hero number + label + context line, with an optional progress meter (0–1). */
export function StatTile({
  label,
  value,
  detail,
  meter,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  meter?: number;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-2xl bg-surface p-3">
      <span className="text-[11px] font-bold tracking-wider text-muted uppercase">{label}</span>
      <span className="truncate font-condensed text-[28px] leading-tight font-bold tabular-nums">{value}</span>
      {meter !== undefined ? (
        <span aria-hidden className="mt-1 h-1.5 rounded-full bg-track">
          <span className="block h-1.5 rounded-full bg-accent" style={{ width: `${Math.min(Math.max(meter, 0), 1) * 100}%` }} />
        </span>
      ) : null}
      {detail ? <span className="text-xs font-medium text-muted">{detail}</span> : null}
    </div>
  );
}
