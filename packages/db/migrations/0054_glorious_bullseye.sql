ALTER TABLE "interviews" ADD COLUMN "teams_meeting_id" text;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "zoom_meeting_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "zoom_client_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "zoom_client_secret_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "zoom_client_secret_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "zoom_client_secret_tag" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "zoom_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "zoom_account_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "zoom_account_email" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "zoom_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "zoom_token_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "zoom_token_tag" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "zoom_events" jsonb DEFAULT '[]'::jsonb;