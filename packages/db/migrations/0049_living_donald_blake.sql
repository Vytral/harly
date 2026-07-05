ALTER TABLE "applications" ADD COLUMN "inbound_token" text;--> statement-breakpoint
ALTER TABLE "candidate_messages" ADD COLUMN "in_reply_to" text;--> statement-breakpoint
ALTER TABLE "candidate_messages" ADD COLUMN "references" text;--> statement-breakpoint
ALTER TABLE "candidate_messages" ADD COLUMN "attachments" jsonb;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_inbound_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_inbound_provider" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_inbound_reply_domain" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_inbound_webhook_secret" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_inbound_resend_api_key_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_inbound_resend_api_key_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "email_inbound_resend_api_key_tag" text;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_inbound_token_unique" UNIQUE("inbound_token");