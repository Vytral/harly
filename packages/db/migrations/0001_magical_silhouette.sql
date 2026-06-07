ALTER TABLE "jobs" ADD COLUMN "content_sections" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "sector" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "experience_level" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "education" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_period" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "office_address" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "office_lat" double precision;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "office_lng" double precision;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "office_photos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "deleted_at" timestamp with time zone;