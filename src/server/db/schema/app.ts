import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { LEVELS, SESSION_TYPES } from "@/config/training";
import type { HrSample } from "@/lib/import/types";
import type { AdjustmentChange, SessionStructure } from "@/lib/planning/types";
import { user } from "./auth";

// ── Enums ────────────────────────────────────────────────────────────────────

export const unitsEnum = pgEnum("units", ["km", "mi"]);
export const goalTypeEnum = pgEnum("goal_type", ["finish", "target_time"]);
export const levelEnum = pgEnum("level", LEVELS);
export const goalStatusEnum = pgEnum("goal_status", [
  "upcoming",
  "active",
  "completed",
  "abandoned",
]);
export const phaseEnum = pgEnum("phase", ["base", "build", "specific", "taper", "race"]);
export const sessionTypeEnum = pgEnum("session_type", SESSION_TYPES);
export const activitySourceEnum = pgEnum("activity_source", ["healthkit", "manual"]);
export const rawImportStatusEnum = pgEnum("raw_import_status", [
  "pending",
  "processed",
  "failed",
]);
export const adjustmentRunStatusEnum = pgEnum("adjustment_run_status", [
  "running",
  "done",
  "failed",
]);
export const adjustmentRuleEnum = pgEnum("adjustment_rule", [
  "low_compliance",
  "acwr_high",
  "inactivity_gap",
  "goal_review",
]);
export const adjustmentStatusEnum = pgEnum("adjustment_status", [
  "proposed",
  "accepted",
  "rejected",
  "superseded",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

const id = () => uuid("id").primaryKey().defaultRandom();

/** Every user-owned table carries this; deleting the user cascades. */
const userId = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Local calendar dates (user timezone) are stored as `date` and handled as "YYYY-MM-DD" strings. */
const localDate = (name: string) => date(name, { mode: "string" });

// ── Tables ───────────────────────────────────────────────────────────────────

export const userSettings = pgTable(
  "user_settings",
  {
    userId: userId().primaryKey(),
    timezone: text("timezone").notNull().default("Europe/Madrid"),
    units: unitsEnum("units").notNull().default("km"),
    /** ISO weekday 1 (Mon) … 7 (Sun). */
    weekStart: smallint("week_start").notNull().default(1),
    runDays: smallint("run_days").array().notNull().default(sql`'{2,4,6,7}'::smallint[]`),
    longRunDay: smallint("long_run_day").notNull().default(7),
    maxRunsPerWeek: smallint("max_runs_per_week").notNull().default(4),
    maxHr: smallint("max_hr"),
    restHr: smallint("rest_hr"),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("user_settings_week_start_chk", sql`${t.weekStart} between 1 and 7`),
    check("user_settings_long_run_day_chk", sql`${t.longRunDay} between 1 and 7`),
    check("user_settings_max_runs_chk", sql`${t.maxRunsPerWeek} between 1 and 7`),
  ],
);

export const goal = pgTable(
  "goal",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    raceDate: localDate("race_date").notNull(),
    distanceKm: doublePrecision("distance_km").notNull(),
    goalType: goalTypeEnum("goal_type").notNull(),
    targetTimeSeconds: integer("target_time_seconds"),
    startWeeklyKm: doublePrecision("start_weekly_km").notNull(),
    level: levelEnum("level").notNull(),
    status: goalStatusEnum("status").notNull().default("upcoming"),
    resultTimeSeconds: integer("result_time_seconds"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("goal_user_id_idx").on(t.userId),
    // Exactly one active goal per user (at most one enforced here; "at least one" is app logic).
    uniqueIndex("goal_one_active_per_user").on(t.userId).where(sql`${t.status} = 'active'`),
    check(
      "goal_target_time_required_chk",
      sql`${t.goalType} <> 'target_time' or ${t.targetTimeSeconds} is not null`,
    ),
    check("goal_distance_positive_chk", sql`${t.distanceKm} > 0`),
  ],
);

export const plannedSession = pgTable(
  "planned_session",
  {
    id: id(),
    userId: userId(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goal.id, { onDelete: "cascade" }),
    date: localDate("date").notNull(),
    weekIndex: integer("week_index").notNull(),
    phase: phaseEnum("phase").notNull(),
    type: sessionTypeEnum("type").notNull(),
    targetKm: doublePrecision("target_km").notNull(),
    targetPaceSecPerKm: integer("target_pace_sec_per_km"),
    effortDescription: text("effort_description"),
    structure: jsonb("structure").$type<SessionStructure>(),
    isUserEdited: boolean("is_user_edited").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("planned_session_user_goal_date_idx").on(t.userId, t.goalId, t.date)],
);

export const rawImport = pgTable(
  "raw_import",
  {
    id: id(),
    userId: userId(),
    tokenId: uuid("token_id").references(() => importToken.id, { onDelete: "set null" }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    payloadBytes: integer("payload_bytes").notNull(),
    /** Null when the payload was rejected before storage (e.g. too large). */
    payload: jsonb("payload"),
    status: rawImportStatusEnum("status").notNull().default("pending"),
    error: text("error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("raw_import_user_received_idx").on(t.userId, t.receivedAt)],
);

export const activity = pgTable(
  "activity",
  {
    id: id(),
    userId: userId(),
    /** HealthKit workout id, or `manual:<uuid>` for manual runs. */
    externalId: text("external_id").notNull(),
    source: activitySourceEnum("source").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    km: doublePrecision("km").notNull(),
    seconds: integer("seconds").notNull(),
    avgHr: smallint("avg_hr"),
    maxHr: smallint("max_hr"),
    rpe: smallint("rpe"),
    hrSeries: jsonb("hr_series").$type<HrSample[]>(),
    plannedSessionId: uuid("planned_session_id").references(() => plannedSession.id, {
      onDelete: "set null",
    }),
    rawImportId: uuid("raw_import_id").references(() => rawImport.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("activity_user_external_uq").on(t.userId, t.externalId),
    index("activity_user_start_idx").on(t.userId, t.startAt),
    check("activity_rpe_chk", sql`${t.rpe} is null or ${t.rpe} between 1 and 10`),
  ],
);

export const routePoint = pgTable(
  "route_point",
  {
    userId: userId(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activity.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    altitude: doublePrecision("altitude"),
    timestamp: timestamp("timestamp", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.activityId, t.idx] })],
);

export const importToken = pgTable(
  "import_token",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    /** SHA-256 hex of the full token; the plaintext is shown once and never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("import_token_user_id_idx").on(t.userId)],
);

/** Fixed-window rate-limit counters (Postgres-backed so they work across serverless instances). */
export const rateLimit = pgTable(
  "rate_limit",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const planAdjustmentRun = pgTable(
  "plan_adjustment_run",
  {
    userId: userId(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goal.id, { onDelete: "cascade" }),
    weekStart: localDate("week_start").notNull(),
    status: adjustmentRunStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.goalId, t.weekStart] })],
);

export const planAdjustment = pgTable(
  "plan_adjustment",
  {
    id: id(),
    userId: userId(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goal.id, { onDelete: "cascade" }),
    runWeekStart: localDate("run_week_start").notNull(),
    rule: adjustmentRuleEnum("rule").notNull(),
    reason: text("reason").notNull(),
    changes: jsonb("changes").$type<AdjustmentChange[]>().notNull(),
    status: adjustmentStatusEnum("status").notNull().default("proposed"),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("plan_adjustment_user_goal_status_idx").on(t.userId, t.goalId, t.status)],
);
