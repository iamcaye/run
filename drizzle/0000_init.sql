CREATE TYPE "public"."activity_source" AS ENUM('healthkit', 'manual');--> statement-breakpoint
CREATE TYPE "public"."adjustment_rule" AS ENUM('low_compliance', 'acwr_high', 'inactivity_gap', 'goal_review');--> statement-breakpoint
CREATE TYPE "public"."adjustment_run_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."adjustment_status" AS ENUM('proposed', 'accepted', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('upcoming', 'active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."goal_type" AS ENUM('finish', 'target_time');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."phase" AS ENUM('base', 'build', 'specific', 'taper', 'race');--> statement-breakpoint
CREATE TYPE "public"."raw_import_status" AS ENUM('pending', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."session_type" AS ENUM('easy', 'long', 'tempo', 'intervals', 'race_pace', 'strides', 'race', 'rest');--> statement-breakpoint
CREATE TYPE "public"."units" AS ENUM('km', 'mi');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"external_id" text NOT NULL,
	"source" "activity_source" NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"km" double precision NOT NULL,
	"seconds" integer NOT NULL,
	"avg_hr" smallint,
	"max_hr" smallint,
	"rpe" smallint,
	"hr_series" jsonb,
	"planned_session_id" uuid,
	"raw_import_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_rpe_chk" CHECK ("activity"."rpe" is null or "activity"."rpe" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"race_date" date NOT NULL,
	"distance_km" double precision NOT NULL,
	"goal_type" "goal_type" NOT NULL,
	"target_time_seconds" integer,
	"start_weekly_km" double precision NOT NULL,
	"level" "level" NOT NULL,
	"status" "goal_status" DEFAULT 'upcoming' NOT NULL,
	"result_time_seconds" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_target_time_required_chk" CHECK ("goal"."goal_type" <> 'target_time' or "goal"."target_time_seconds" is not null),
	CONSTRAINT "goal_distance_positive_chk" CHECK ("goal"."distance_km" > 0)
);
--> statement-breakpoint
CREATE TABLE "import_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "import_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "plan_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"goal_id" uuid NOT NULL,
	"run_week_start" date NOT NULL,
	"rule" "adjustment_rule" NOT NULL,
	"reason" text NOT NULL,
	"changes" jsonb NOT NULL,
	"status" "adjustment_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plan_adjustment_run" (
	"user_id" text NOT NULL,
	"goal_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"status" "adjustment_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "plan_adjustment_run_user_id_goal_id_week_start_pk" PRIMARY KEY("user_id","goal_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "planned_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"goal_id" uuid NOT NULL,
	"date" date NOT NULL,
	"week_index" integer NOT NULL,
	"phase" "phase" NOT NULL,
	"type" "session_type" NOT NULL,
	"target_km" double precision NOT NULL,
	"target_pace_sec_per_km" integer,
	"effort_description" text,
	"structure" jsonb,
	"is_user_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "raw_import" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload_bytes" integer NOT NULL,
	"payload" jsonb,
	"status" "raw_import_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "route_point" (
	"user_id" text NOT NULL,
	"activity_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"altitude" double precision,
	"timestamp" timestamp with time zone,
	CONSTRAINT "route_point_activity_id_idx_pk" PRIMARY KEY("activity_id","idx")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'Europe/Madrid' NOT NULL,
	"units" "units" DEFAULT 'km' NOT NULL,
	"week_start" smallint DEFAULT 1 NOT NULL,
	"run_days" smallint[] DEFAULT '{2,4,6,7}'::smallint[] NOT NULL,
	"long_run_day" smallint DEFAULT 7 NOT NULL,
	"max_runs_per_week" smallint DEFAULT 4 NOT NULL,
	"max_hr" smallint,
	"rest_hr" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_week_start_chk" CHECK ("user_settings"."week_start" between 1 and 7),
	CONSTRAINT "user_settings_long_run_day_chk" CHECK ("user_settings"."long_run_day" between 1 and 7),
	CONSTRAINT "user_settings_max_runs_chk" CHECK ("user_settings"."max_runs_per_week" between 1 and 7)
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_planned_session_id_planned_session_id_fk" FOREIGN KEY ("planned_session_id") REFERENCES "public"."planned_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_raw_import_id_raw_import_id_fk" FOREIGN KEY ("raw_import_id") REFERENCES "public"."raw_import"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_token" ADD CONSTRAINT "import_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_adjustment" ADD CONSTRAINT "plan_adjustment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_adjustment" ADD CONSTRAINT "plan_adjustment_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_adjustment_run" ADD CONSTRAINT "plan_adjustment_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_adjustment_run" ADD CONSTRAINT "plan_adjustment_run_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_session" ADD CONSTRAINT "planned_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_session" ADD CONSTRAINT "planned_session_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_import" ADD CONSTRAINT "raw_import_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_import" ADD CONSTRAINT "raw_import_token_id_import_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."import_token"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_point" ADD CONSTRAINT "route_point_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_point" ADD CONSTRAINT "route_point_activity_id_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_user_external_uq" ON "activity" USING btree ("user_id","external_id");--> statement-breakpoint
CREATE INDEX "activity_user_start_idx" ON "activity" USING btree ("user_id","start_at");--> statement-breakpoint
CREATE INDEX "goal_user_id_idx" ON "goal" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_one_active_per_user" ON "goal" USING btree ("user_id") WHERE "goal"."status" = 'active';--> statement-breakpoint
CREATE INDEX "import_token_user_id_idx" ON "import_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plan_adjustment_user_goal_status_idx" ON "plan_adjustment" USING btree ("user_id","goal_id","status");--> statement-breakpoint
CREATE INDEX "planned_session_user_goal_date_idx" ON "planned_session" USING btree ("user_id","goal_id","date");--> statement-breakpoint
CREATE INDEX "raw_import_user_received_idx" ON "raw_import" USING btree ("user_id","received_at");