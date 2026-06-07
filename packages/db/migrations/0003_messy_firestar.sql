ALTER TABLE "workspace_settings" ADD COLUMN "ai_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "ai_provider" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "ai_model_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "ai_api_key_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "ai_api_key_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "ai_api_key_tag" text;