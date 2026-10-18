import Link from "next/link";
import { SESSION_LABELS } from "@/lib/planning/describe";
import { formatDistance, formatDuration, formatPace, type Units } from "@/lib/units";
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

export function ActivityRow({ a, units }: { a: ActivityRowData; units: Units }) {
  return (
    <li>
      <Link href={`/activities/${a.id}`} className="flex items-center gap-3 py-3 hover:bg-foreground/5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {activityDate(a.localDate)} <span className="font-normal text-muted">· {a.startTime}</span>
          </p>
          <p className="truncate text-xs text-muted">
            {a.sessionType ? SESSION_LABELS[a.sessionType] : "Unplanned run"}
            {a.source === "manual" ? " · logged manually" : ""}
            {a.avgHr ? ` · ${a.avgHr} bpm` : ""}
          </p>
        </div>
        <div className="text-right text-sm tabular-nums">
          <p className="font-medium">{formatDistance(a.km, units)}</p>
          <p className="text-xs text-muted">
            {formatDuration(a.seconds)} · {formatPace(a.seconds / a.km, units)}
          </p>
        </div>
        <span
          className={`w-12 shrink-0 text-center text-xs ${a.rpe ? "font-semibold" : "text-accent"}`}
          title={a.rpe ? `RPE ${a.rpe} — ${rpeLabel(a.rpe)}` : "No RPE yet"}
        >
          {a.rpe ? `RPE ${a.rpe}` : "+ RPE"}
        </span>
      </Link>
    </li>
  );
}
