ALTER TABLE "jobs" ADD COLUMN "job_location_country" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "job_location_region" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "remote_eligible_countries" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "valid_through" timestamp with time zone;
