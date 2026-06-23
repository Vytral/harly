ALTER TABLE "workspace_settings" ADD COLUMN "portal_google_client_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "portal_google_client_secret_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "portal_google_client_secret_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "portal_google_client_secret_tag" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "portal_github_client_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "portal_github_client_secret_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "portal_github_client_secret_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "portal_github_client_secret_tag" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "portal_show_application_status" boolean DEFAULT true NOT NULL;