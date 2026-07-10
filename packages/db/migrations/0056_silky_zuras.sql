ALTER TABLE "applications" ADD COLUMN "cover_letter" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "address" text;