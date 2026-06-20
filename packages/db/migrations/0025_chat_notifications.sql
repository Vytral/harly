ALTER TABLE "workspace_settings" ADD COLUMN "chat_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "workspace_settings" ADD COLUMN "chat_provider" text;
ALTER TABLE "workspace_settings" ADD COLUMN "chat_webhook_ciphertext" text;
ALTER TABLE "workspace_settings" ADD COLUMN "chat_webhook_iv" text;
ALTER TABLE "workspace_settings" ADD COLUMN "chat_webhook_tag" text;
ALTER TABLE "workspace_settings" ADD COLUMN "chat_events" jsonb DEFAULT '[]'::jsonb NOT NULL;
