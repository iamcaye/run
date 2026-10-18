"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toDisplayDistance, type Units } from "@/lib/units";
import { AXIS, ChartFrame, shortDate, TooltipBox } from "./chart-frame";

export type VolumeDatum = { weekStart: string; plannedKm: number; actualKm: number; isCurrent: boolean; isFuture: boolean };

const PLANNED = "var(--series-1)";
const ACTUAL = "var(--series-2)";

export function VolumeChart({ data, units }: { data: readonly VolumeDatum[]; units: Units }) {
  const rows = data.map((d, i) => ({
    ...d,
    label: `W${i + 1}`,
    planned: Number(toDisplayDistance(d.plannedKm, units).toFixed(1)),
    // No bar for weeks that haven't happened yet.
    actual: d.isFuture ? null : Number(toDisplayDistance(d.actualKm, units).toFixed(1)),
  }));

  return (
    <ChartFrame
      title="Weekly volume"
      subtitle={`Planned vs run, ${units} per week`}
      legend={[
        { label: "Planned", swatch: PLANNED },
        { label: "Run", swatch: ACTUAL },
      ]}
      table={{
        columns: ["Week", "Starts", `Planned (${units})`, `Run (${units})`],
        rows: rows.map((r) => [r.label, shortDate(r.weekStart), r.planned.toFixed(1), r.actual === null ? "—" : r.actual.toFixed(1)]),
      }}
    >
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={2} barCategoryGap="20%" margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={8} />
            <YAxis {...AXIS} axisLine={false} width={44} />
            <Tooltip
              cursor={{ fill: "var(--foreground)", fillOpacity: 0.05 }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                if (!active || !d) return null;
                return (
                  <TooltipBox
                    title={`${d.label} · ${shortDate(d.weekStart)}${d.isCurrent ? " (this week)" : ""}`}
                    rows={[
                      { label: "Planned", value: `${d.planned.toFixed(1)} ${units}`, swatch: PLANNED },
                      { label: "Run", value: d.actual === null ? "—" : `${d.actual.toFixed(1)} ${units}`, swatch: ACTUAL },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="planned" name="Planned" fill={PLANNED} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="actual" name="Run" fill={ACTUAL} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
