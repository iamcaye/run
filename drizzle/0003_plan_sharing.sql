CREATE TABLE "plan_update_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"follow_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "custom_plan" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "custom_plan" ADD COLUMN "share_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_follow" ADD COLUMN "author_id" text;--> statement-breakpoint
ALTER TABLE "plan_follow" ADD COLUMN "author_name" text;--> statement-breakpoint
ALTER TABLE "plan_follow" ADD COLUMN "snapshot_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_follow" ADD COLUMN "sync_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_update_notice" ADD CONSTRAINT "plan_update_notice_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_update_notice" ADD CONSTRAINT "plan_update_notice_follow_id_plan_follow_id_fk" FOREIGN KEY ("follow_id") REFERENCES "public"."plan_follow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_update_notice_one_open" ON "plan_update_notice" USING btree ("follow_id") WHERE "plan_update_notice"."dismissed_at" is null;--> statement-breakpoint
ALTER TABLE "plan_follow" ADD CONSTRAINT "plan_follow_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_plan" ADD CONSTRAINT "custom_plan_share_token_unique" UNIQUE("share_token");--> statement-breakpoint
-- Phase 1 follows are all own plans.
UPDATE "plan_follow" SET "author_id" = "user_id";
