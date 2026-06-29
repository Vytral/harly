ALTER TABLE "interviews" ADD COLUMN "brief_content" jsonb;
ALTER TABLE "workspace_settings" ADD COLUMN "ai_duplicate_check" boolean DEFAULT false NOT NULL;
