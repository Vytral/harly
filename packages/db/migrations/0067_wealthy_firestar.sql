ALTER TABLE "workspace_settings" ADD COLUMN "portal_linkedin_client_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "portal_linkedin_client_secret_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "portal_linkedin_client_secret_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "portal_linkedin_client_secret_tag" text;