CREATE TABLE "instance_update_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"latest_version" text,
	"latest_notes_url" text,
	"latest_notes_summary" text,
	"latest_checked_at" timestamp with time zone,
	"latest_check_error" text,
	"updater_last_seen_at" timestamp with time zone,
	"updater_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_update_state_singleton_check" CHECK ("instance_update_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "update_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by" text,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"from_version" text NOT NULL,
	"target_version" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text,
	"log_tail" text,
	"claimed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "update_requests_status_check" CHECK ("update_requests"."status" in ('pending', 'claimed', 'running', 'succeeded', 'failed', 'rolled_back', 'cancelled')),
	CONSTRAINT "update_requests_trigger_check" CHECK ("update_requests"."trigger" in ('manual', 'auto'))
);
--> statement-breakpoint
CREATE TABLE "workspace_update_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"auto_update_enabled" boolean DEFAULT false NOT NULL,
	"auto_update_level" text DEFAULT 'patch' NOT NULL,
	"window_days" integer[] DEFAULT '{1,2,3,4,5}'::integer[] NOT NULL,
	"window_start_hour" integer DEFAULT 2 NOT NULL,
	"window_end_hour" integer DEFAULT 5 NOT NULL,
	"window_timezone" text DEFAULT 'UTC' NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_update_settings_level_check" CHECK ("workspace_update_settings"."auto_update_level" in ('patch', 'minor')),
	CONSTRAINT "workspace_update_settings_hours_check" CHECK ("workspace_update_settings"."window_start_hour" between 0 and 23 and "workspace_update_settings"."window_end_hour" between 0 and 23 and "workspace_update_settings"."window_start_hour" <> "workspace_update_settings"."window_end_hour")
);
--> statement-breakpoint
ALTER TABLE "update_requests" ADD CONSTRAINT "update_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_requests" ADD CONSTRAINT "update_requests_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_update_settings" ADD CONSTRAINT "workspace_update_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_update_settings" ADD CONSTRAINT "workspace_update_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "update_requests_one_active_uidx" ON "update_requests" USING btree ((true)) WHERE "update_requests"."status" in ('pending', 'claimed', 'running');--> statement-breakpoint
CREATE INDEX "update_requests_org_created_idx" ON "update_requests" USING btree ("organization_id","created_at");