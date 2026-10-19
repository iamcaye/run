import Link from "next/link";
import { SESSION_LABELS } from "@/lib/planning/describe";
import { formatDistanceValue, formatDuration, formatPace, type Units } from "@/lib/units";
import type { SessionType } from "@/config/training";
import { rpeLabel } from "./rpe";

export type ActivityRowData = {
  id: string;
  localDate: string;
  startTime: string;
  km: number;
  seconds: number;
  avgHr: number | null;
  rpe: number | null;
  source: "healthkit" | "manual";
  sessionType: SessionType | null;
};

export function activityDate(localDate: string): string {
  return new Date(`${localDate}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

// Shared with the header row on /activities so the columns line up.
export const ACTIVITY_COLUMNS = "lg:grid-cols-[6rem_1fr_6rem_6rem_6rem_5rem_4rem]";

// `columns` turns the row into a table-like grid at lg (wide /activities list only).
export function ActivityRow({ a, units, columns = false }: { a: ActivityRowData; units: Units; columns?: boolean }) {
  const d = new Date(`${a.localDate}T00:00:00Z`);
  return (
    <li>
      <Link href={`/activities/${a.id}`} className={`flex items-center gap-3 py-3 transition-colors hover:bg-foreground/5 ${columns ? `lg:grid lg:items-center ${ACTIVITY_COLUMNS}` : ""}`}>
        <span className="sr-only">{activityDate(a.localDate)}</span>
        <span aria-hidden className="flex w-10 shrink-0 flex-col items-center leading-none">
          <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
            {d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
          </span>
          <span className="font-condensed text-2xl font-bold tabular-nums">{d.getUTCDate()}</span>
          <span className="text-[10px] font-semibold text-muted uppercase">
            {d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {a.sessionType ? SESSION_LABELS[a.sessionType] : "Unplanned run"}
            {columns && a.source === "manual" ? (
              <span className="ml-2 hidden text-xs font-normal text-muted lg:inline">manual</span>
            ) : null}
          </p>
          <p className={`truncate text-xs text-muted tabular-nums ${columns ? "lg:hidden" : ""}`}>
            {formatDuration(a.seconds)} · {formatPace(a.seconds / a.km, units)}
            {a.avgHr ? ` · ${a.avgHr} bpm` : ""}
            {a.source === "manual" ? " · manual" : ""}
          </p>
        </div>
        <span className="font-condensed text-2xl font-bold tabular-nums">
          {formatDistanceValue(a.km, units)}
          <span className="text-sm text-muted"> {units}</span>
        </span>
        {columns ? (
          <>
            <span className="hidden tabular-nums lg:block">{formatDuration(a.seconds)}</span>
            <span className="hidden tabular-nums lg:block">{formatPace(a.seconds / a.km, units)}</span>
            <span className="hidden tabular-nums lg:block">{a.avgHr ? `${a.avgHr} bpm` : "—"}</span>
          </>
        ) : null}
        <span
          className={`w-12 shrink-0 rounded-full py-1 text-center text-[11px] font-bold ${a.rpe ? "bg-foreground text-background" : "text-accent ring-[1.5px] ring-inset ring-accent"}`}
          title={a.rpe ? `RPE ${a.rpe} — ${rpeLabel(a.rpe)}` : "No RPE yet"}
        >
          {a.rpe ? `RPE ${a.rpe}` : "+ RPE"}
        </span>
      </Link>
    </li>
  );
}
