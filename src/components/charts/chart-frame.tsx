import type { ReactNode } from "react";

/** Title, optional legend, the plot, and a table view of the same data (accessibility). */
export function ChartFrame({
  title,
  subtitle,
  legend,
  table,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: readonly { label: string; swatch: string; shape?: "bar" | "line" | "dot" }[];
  table: { columns: readonly string[]; rows: readonly (readonly ReactNode[])[] };
  children: ReactNode;
}) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-col gap-0.5">
        <span className="font-semibold">{title}</span>
        {subtitle ? <span className="text-xs text-muted">{subtitle}</span> : null}
      </figcaption>
      {legend && legend.length > 1 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={l.shape === "line" ? "h-0.5 w-3" : l.shape === "dot" ? "size-2 rounded-full" : "size-2.5 rounded-sm"}
                style={{ background: l.swatch }}
              />
              {l.label}
            </li>
          ))}
        </ul>
      ) : null}
      {children}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted">Show data</summary>
        <div className="mt-2 max-h-56 overflow-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-muted">
              <tr>
                {table.columns.map((c) => (
                  <th key={c} className="py-1 pr-3 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  {r.map((cell, j) => (
                    <td key={j} className="py-1 pr-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Tooltip box used by every chart (text in text tokens; colour only on the swatch). */
export function TooltipBox({
  title,
  rows,
}: {
  title: string;
  rows: readonly { label: string; value: string; swatch?: string }[];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-1.5">
          {r.swatch ? <span aria-hidden className="size-2 rounded-sm" style={{ background: r.swatch }} /> : null}
          <span className="text-muted">{r.label}</span>
          <span className="ml-auto pl-3 tabular-nums">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export const shortDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export const AXIS = { stroke: "var(--border)", tick: { fill: "var(--muted)", fontSize: 11 }, tickLine: false } as const;
