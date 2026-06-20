ALTER TABLE "workspace_settings" ADD COLUMN "turnstile_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "workspace_settings" ADD COLUMN "turnstile_site_key" text;
ALTER TABLE "workspace_settings" ADD COLUMN "turnstile_secret_ciphertext" text;
ALTER TABLE "workspace_settings" ADD COLUMN "turnstile_secret_iv" text;
ALTER TABLE "workspace_settings" ADD COLUMN "turnstile_secret_tag" text;
