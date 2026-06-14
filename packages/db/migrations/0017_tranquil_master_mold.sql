ALTER TABLE "workspace_settings" ADD COLUMN "email_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_provider" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_from" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_api_key_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_api_key_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_api_key_tag" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_smtp_host" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_smtp_port" integer;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_smtp_secure" boolean;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_smtp_user" text;