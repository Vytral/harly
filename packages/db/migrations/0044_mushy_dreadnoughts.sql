ALTER TABLE "workspace_settings" ADD COLUMN "invite_link_token" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "invite_link_role" text DEFAULT 'recruiter' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "invite_link_enabled" boolean DEFAULT false NOT NULL;