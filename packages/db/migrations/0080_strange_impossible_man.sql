CREATE TABLE "ai_action_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_id" text,
	"action_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"result" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "docusign_envelope_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_account_email" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_account_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_base_url" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_client_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_client_secret_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_client_secret_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_client_secret_tag" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_access_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_access_token_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_access_token_tag" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_refresh_token_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_refresh_token_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_refresh_token_tag" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_connect_secret" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "offer_signature_channel" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_action_receipts" ADD CONSTRAINT "ai_action_receipts_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_receipts" ADD CONSTRAINT "ai_action_receipts_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_action_receipts_workspace_action_uidx" ON "ai_action_receipts" USING btree ("workspace_id","action_id");--> statement-breakpoint
CREATE INDEX "ai_action_receipts_workspace_created_at_idx" ON "ai_action_receipts" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_action_receipts_expires_idx" ON "ai_action_receipts" USING btree ("expires_at");