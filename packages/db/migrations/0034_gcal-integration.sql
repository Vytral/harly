ALTER TABLE "interviews" ADD COLUMN "gcal_event_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "gcal_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "gcal_account_email" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "gcal_calendar_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "gcal_refresh_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "gcal_refresh_token_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "gcal_refresh_token_tag" text;