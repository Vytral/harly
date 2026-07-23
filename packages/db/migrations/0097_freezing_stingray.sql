DROP TABLE "docusign_webhook_events" CASCADE;--> statement-breakpoint
ALTER TABLE "offers" DROP COLUMN "docusign_envelope_id";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_enabled";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_account_email";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_account_id";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_auth_base_url";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_base_url";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_client_id";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_client_secret_ciphertext";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_client_secret_iv";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_client_secret_tag";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_access_token_ciphertext";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_access_token_iv";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_access_token_tag";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_access_token_expires_at";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_refresh_token_ciphertext";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_refresh_token_iv";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_refresh_token_tag";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "docusign_connect_secret";