ALTER TABLE "custom_roles" ADD COLUMN "scope" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "region" text;