ALTER TABLE "scheduled_reports" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduled_reports" ADD COLUMN "locked_by" text;