CREATE TYPE "public"."plan_follow_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "custom_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"doc" jsonb DEFAULT '{"weeks":[]}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_follow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"custom_plan_id" uuid,
	"plan_name" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"start_date" date,
	"status" "plan_follow_status" DEFAULT 'inactive' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "session_type" NOT NULL,
	"notes" text,
	"steps" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planned_session" ALTER COLUMN "goal_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "planned_session" ALTER COLUMN "phase" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "planned_session" ADD COLUMN "follow_id" uuid;--> statement-breakpoint
ALTER TABLE "planned_session" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "custom_plan" ADD CONSTRAINT "custom_plan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_follow" ADD CONSTRAINT "plan_follow_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_follow" ADD CONSTRAINT "plan_follow_custom_plan_id_custom_plan_id_fk" FOREIGN KEY ("custom_plan_id") REFERENCES "public"."custom_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout" ADD CONSTRAINT "workout_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_plan_user_id_idx" ON "custom_plan" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_follow_one_active_per_user" ON "plan_follow" USING btree ("user_id") WHERE "plan_follow"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "plan_follow_user_plan_uq" ON "plan_follow" USING btree ("user_id","custom_plan_id") WHERE "plan_follow"."custom_plan_id" is not null;--> statement-breakpoint
CREATE INDEX "workout_user_id_idx" ON "workout" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "planned_session" ADD CONSTRAINT "planned_session_follow_id_plan_follow_id_fk" FOREIGN KEY ("follow_id") REFERENCES "public"."plan_follow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planned_session_user_follow_date_idx" ON "planned_session" USING btree ("user_id","follow_id","date");--> statement-breakpoint
ALTER TABLE "planned_session" ADD CONSTRAINT "planned_session_one_owner_chk" CHECK (("planned_session"."goal_id" is null) <> ("planned_session"."follow_id" is null));