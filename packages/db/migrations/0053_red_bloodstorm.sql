ALTER TABLE "interviews" ADD COLUMN "meet_link" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "outlook_client_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "outlook_client_secret_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "outlook_client_secret_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "outlook_client_secret_tag" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "outlook_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "outlook_account_email" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "outlook_access_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "outlook_access_token_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "outlook_access_token_tag" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "outlook_refresh_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "outlook_refresh_token_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "outlook_refresh_token_tag" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "outlook_calendar_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "outlook_events" jsonb DEFAULT '[]'::jsonb;