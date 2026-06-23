ALTER TABLE "workspace_settings" ADD COLUMN "ai_auto_score" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "legal_entity_name" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "legal_entity_address" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "legal_entity_email" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "legal_entity_website" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "legal_jurisdiction" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "dpo_email" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "data_retention_applicants_months" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "data_retention_talent_pool_months" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "consent_checkbox_text" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "legal_pages" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "legal_configured" boolean DEFAULT false NOT NULL;