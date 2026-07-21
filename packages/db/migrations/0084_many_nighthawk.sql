CREATE TABLE "docusign_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"event_key" text NOT NULL,
	"envelope_id" text NOT NULL,
	"event_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "docusign_auth_base_url" text;--> statement-breakpoint
ALTER TABLE "docusign_webhook_events" ADD CONSTRAINT "docusign_webhook_events_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "docusign_webhook_events_workspace_key_idx" ON "docusign_webhook_events" USING btree ("workspace_id","event_key");--> statement-breakpoint
CREATE INDEX "docusign_webhook_events_workspace_envelope_idx" ON "docusign_webhook_events" USING btree ("workspace_id","envelope_id");