ALTER TABLE "candidates" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "education_entries" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "experience_entries" jsonb DEFAULT '[]'::jsonb NOT NULL;