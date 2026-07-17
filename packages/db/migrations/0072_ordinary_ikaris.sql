ALTER TABLE "interviews" ADD COLUMN "jitsi_room" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "jitsi_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "jitsi_base_url" text;