import type { SessionType } from "@/config/training";
import type { LocalDate } from "@/lib/time";

/** An activity as metrics see it. `localDate` is computed by the caller in the user's time zone. */
export type MetricActivity = {
  id: string;
  localDate: LocalDate;
  km: number;
  seconds: number;
  rpe: number | null;
  avgHr: number | null;
  plannedSessionId: string | null;
};

export type MetricSession = {
  id: string;
  date: LocalDate;
  type: SessionType;
  targetKm: number;
};

export type HrSettings = { maxHr: number | null; restHr: number | null };
