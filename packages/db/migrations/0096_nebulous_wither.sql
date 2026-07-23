ALTER TABLE "signature_envelopes" ALTER COLUMN "provider" SET DEFAULT 'docuseal';--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "esign_submission_id" text;--> statement-breakpoint
ALTER TABLE "signature_recipients" ADD COLUMN "signing_url" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docuseal_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docuseal_url" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docuseal_api_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docuseal_api_token_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docuseal_api_token_tag" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docuseal_webhook_secret" text;--> statement-breakpoint
UPDATE "workspace_settings" SET "offer_signature_channel" = 'esign' WHERE "offer_signature_channel" = 'docusign';