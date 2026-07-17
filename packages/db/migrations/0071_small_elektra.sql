ALTER TABLE "workspace_settings" ADD COLUMN "telegram_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "telegram_bot_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "telegram_bot_token_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "telegram_bot_token_tag" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "telegram_bot_username" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "telegram_events" jsonb DEFAULT '[]'::jsonb;