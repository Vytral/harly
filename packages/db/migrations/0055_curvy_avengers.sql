ALTER TABLE "workspace_settings" ADD COLUMN "zoom_refresh_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "zoom_refresh_token_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "zoom_refresh_token_tag" text;