"use client";

import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartFrame, shortDate, TooltipBox } from "./chart-frame";

export type AcwrDatum = { date: string; ratio: number | null; acute: number; chronic: number };

const LINE = "var(--series-1)";
const LOW = 0.8;
const HIGH = 1.5;

const zoneLabel = (r: number | null) =>
  r === null ? "no load yet" : r > HIGH ? "high — injury risk" : r < LOW ? "low — detraining" : "in range";

/** Single series (no legend); the band is labelled in place, never colour alone. */
export function AcwrChart({ data, insufficientHistory }: { data: readonly AcwrDatum[]; insufficientHistory: boolean }) {
  const rows = data.map((d) => ({ ...d, ratio: d.ratio === null ? null : Number(d.ratio.toFixed(2)) }));
  const maxRatio = Math.max(2, ...rows.map((r) => r.ratio ?? 0));
  const yMax = Math.ceil(maxRatio * 2) / 2;

  return (
    <ChartFrame
      title="Training load ratio (ACWR)"
      subtitle={
        insufficientHistory
          ? "Last 7 days vs 28-day average. Shown once you have 4 weeks of runs (earlier values aren't meaningful)."
          : "Last 7 days vs 28-day average (session RPE × minutes)"
      }
      table={{
        columns: ["Date", "Ratio", "7-day load", "28-day avg/week", "Zone"],
        rows: rows
          .filter((_, i) => i % 7 === rows.length % 7 || i === rows.length - 1)
          .map((r) => [shortDate(r.date), r.ratio?.toFixed(2) ?? "—", Math.round(r.acute), Math.round(r.chronic), zoneLabel(r.ratio)]),
      }}
    >
      {rows.every((r) => r.ratio === null) ? (
        <p className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted">
          Not enough history yet
        </p>
      ) : (
      <div className="h-48 lg:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <ReferenceArea
              y1={LOW}
              y2={HIGH}
              fill="var(--status-good)"
              fillOpacity={0.12}
              ifOverflow="hidden"
              label={{ value: "0.8–1.5 target range", position: "insideTopLeft", fill: "var(--muted)", fontSize: 10 }}
            />
            <ReferenceArea
              y1={HIGH}
              y2={yMax}
              fill="var(--status-critical)"
              fillOpacity={0.1}
              ifOverflow="hidden"
              label={{ value: "> 1.5 high risk", position: "insideTopLeft", fill: "var(--muted)", fontSize: 10 }}
            />
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis dataKey="date" tickFormatter={shortDate} {...AXIS} minTickGap={24} />
            <YAxis {...AXIS} axisLine={false} domain={[0, yMax]} ticks={[0, LOW, HIGH, yMax]} width={44} />
            <Tooltip
              cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                if (!active || !d) return null;
                return (
                  <TooltipBox
                    title={shortDate(d.date)}
                    rows={[
                      { label: "Ratio", value: d.ratio?.toFixed(2) ?? "—", swatch: LINE },
                      { label: "Zone", value: zoneLabel(d.ratio) },
                      { label: "7-day load", value: String(Math.round(d.acute)) },
                      { label: "28-day avg/week", value: String(Math.round(d.chronic)) },
                    ]}
                  />
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="ratio"
              stroke={LINE}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}
    </ChartFrame>
  );
}
