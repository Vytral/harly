ALTER TABLE "workspace_settings" ADD COLUMN "captcha_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "captcha_provider" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "recaptcha_site_key" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "recaptcha_secret_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "recaptcha_secret_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "recaptcha_secret_tag" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "hcaptcha_site_key" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "hcaptcha_secret_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "hcaptcha_secret_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "hcaptcha_secret_tag" text;