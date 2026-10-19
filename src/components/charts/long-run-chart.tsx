"use client";

import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { toDisplayDistance, type Units } from "@/lib/units";
import { AXIS, ChartFrame, shortDate, TooltipBox } from "./chart-frame";

export type LongRunDatum = { date: string; plannedKm: number; actualKm: number | null };

const PLANNED = "var(--series-1)";
const ACTUAL = "var(--series-2)";

export function LongRunChart({ data, units }: { data: readonly LongRunDatum[]; units: Units }) {
  const rows = data.map((d) => ({
    date: d.date,
    planned: Number(toDisplayDistance(d.plannedKm, units).toFixed(1)),
    actual: d.actualKm === null ? null : Number(toDisplayDistance(d.actualKm, units).toFixed(1)),
  }));

  return (
    <ChartFrame
      title="Long run progression"
      subtitle={`${units} per long run`}
      legend={[
        { label: "Planned", swatch: PLANNED, shape: "line" },
        { label: "Run", swatch: ACTUAL, shape: "dot" },
      ]}
      table={{
        columns: ["Date", `Planned (${units})`, `Run (${units})`],
        rows: rows.map((r) => [shortDate(r.date), r.planned.toFixed(1), r.actual?.toFixed(1) ?? "—"]),
      }}
    >
      <div className="h-44 lg:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis dataKey="date" tickFormatter={shortDate} {...AXIS} minTickGap={24} />
            <YAxis {...AXIS} axisLine={false} width={44} />
            <Tooltip
              cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                if (!active || !d) return null;
                return (
                  <TooltipBox
                    title={`Long run · ${shortDate(d.date)}`}
                    rows={[
                      { label: "Planned", value: `${d.planned.toFixed(1)} ${units}`, swatch: PLANNED },
                      { label: "Run", value: d.actual === null ? "—" : `${d.actual.toFixed(1)} ${units}`, swatch: ACTUAL },
                    ]}
                  />
                );
              }}
            />
            <Line type="monotone" dataKey="planned" stroke={PLANNED} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Scatter dataKey="actual" fill={ACTUAL} stroke="var(--surface)" strokeWidth={2} shape="circle" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
