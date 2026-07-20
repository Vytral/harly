CREATE TYPE "public"."interview_sync_operation" AS ENUM('upsert', 'cancel');--> statement-breakpoint
CREATE TYPE "public"."interview_sync_provider" AS ENUM('google_calendar', 'zoom', 'microsoft_teams', 'jitsi');--> statement-breakpoint
CREATE TYPE "public"."interview_sync_status" AS ENUM('pending', 'synced', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "interview_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"interview_id" uuid NOT NULL,
	"provider" "interview_sync_provider" NOT NULL,
	"operation" "interview_sync_operation" DEFAULT 'upsert' NOT NULL,
	"status" "interview_sync_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"provider_resource_id" text,
	"provider_url" text,
	"last_error" text,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_syncs" ADD CONSTRAINT "interview_syncs_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_syncs" ADD CONSTRAINT "interview_syncs_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interview_syncs_interview_provider_idx" ON "interview_syncs" USING btree ("interview_id","provider");--> statement-breakpoint
CREATE INDEX "interview_syncs_due_idx" ON "interview_syncs" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "interview_syncs_workspace_status_idx" ON "interview_syncs" USING btree ("workspace_id","status");