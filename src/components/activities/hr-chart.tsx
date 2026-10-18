"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartFrame, TooltipBox } from "@/components/charts/chart-frame";
import type { HrSample } from "@/lib/import/types";

const LINE = "var(--series-1)";

/** Heart rate over the run (single series, no legend). Zone floors as faint reference lines. */
export function HrChart({ samples, zoneFloors }: { samples: readonly HrSample[]; zoneFloors: readonly { zone: number; bpm: number }[] }) {
  const rows = samples.map((s) => ({ min: Math.round((s.t / 60) * 10) / 10, bpm: s.bpm }));
  const lo = Math.min(...rows.map((r) => r.bpm)) - 5;
  const hi = Math.max(...rows.map((r) => r.bpm)) + 5;

  return (
    <ChartFrame
      title="Heart rate"
      subtitle="bpm over time (minutes)"
      table={{ columns: ["Minute", "bpm"], rows: rows.map((r) => [r.min.toFixed(1), r.bpm]) }}
    >
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            {zoneFloors
              .filter((z) => z.bpm > lo && z.bpm < hi)
              .map((z) => (
                <ReferenceLine
                  key={z.zone}
                  y={z.bpm}
                  stroke="var(--muted)"
                  strokeDasharray="2 4"
                  strokeOpacity={0.6}
                  label={{ value: `Z${z.zone}`, position: "insideLeft", fill: "var(--muted)", fontSize: 10 }}
                />
              ))}
            <XAxis dataKey="min" type="number" domain={["dataMin", "dataMax"]} {...AXIS} tickFormatter={(v: number) => `${Math.round(v)}′`} />
            <YAxis {...AXIS} axisLine={false} domain={[lo, hi]} width={44} allowDecimals={false} />
            <Tooltip
              cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                if (!active || !d) return null;
                return <TooltipBox title={`${d.min.toFixed(1)} min`} rows={[{ label: "Heart rate", value: `${d.bpm} bpm`, swatch: LINE }]} />;
              }}
            />
            <Line type="monotone" dataKey="bpm" stroke={LINE} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
