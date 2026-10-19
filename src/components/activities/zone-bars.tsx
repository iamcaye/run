import type { HrZone } from "@/lib/metrics";
import { formatDuration } from "@/lib/units";

// Ordinal zones: one-hue sequential ramp (amber → track red), lightest step still ≥ 2:1 on the surface.
const RAMP = ["#e9a46a", "#e07f45", "#d45a2c", "#b8391a", "#7f2410"];

/** Time in each Karvonen zone as labelled horizontal bars (values in text, not colour alone). */
export function ZoneBars({ zones, seconds }: { zones: readonly HrZone[]; seconds: readonly number[] }) {
  const total = seconds.reduce((a, s) => a + s, 0) || 1;
  const rows = [
    { label: "Below Z1", range: `< ${zones[0]?.minBpm ?? "?"} bpm`, secs: seconds[0] ?? 0, color: "var(--border)" },
    ...zones.map((z, i) => ({ label: `Z${z.zone}`, range: `${z.minBpm}–${z.maxBpm} bpm`, secs: seconds[i + 1] ?? 0, color: RAMP[i] ?? RAMP[0] })),
  ];
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="font-condensed text-xl font-extrabold uppercase">Time in heart-rate zones</figcaption>
      <ul className="flex flex-col gap-1.5 text-xs">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2">
            <span>
              <span className="font-medium">{r.label}</span>
              <span className="block text-[10px] text-muted">{r.range}</span>
            </span>
            <span className="h-3 overflow-hidden rounded-full bg-track">
              <span className="block h-full rounded-full" style={{ width: `${(r.secs / total) * 100}%`, background: r.color }} />
            </span>
            <span className="text-right tabular-nums">{formatDuration(r.secs)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
