CREATE TABLE "signature_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"envelope_id" uuid NOT NULL,
	"document_id" uuid,
	"document_version_id" uuid,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signature_envelopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"provider" text DEFAULT 'docusign' NOT NULL,
	"provider_envelope_id" text NOT NULL,
	"kind" text DEFAULT 'document' NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"offer_id" uuid,
	"subject" text,
	"created_by_id" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"last_event_at" timestamp with time zone,
	"last_event_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signature_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"envelope_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"generated_at" timestamp with time zone,
	"retry_count" integer,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signature_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"envelope_id" uuid NOT NULL,
	"provider_recipient_id" text NOT NULL,
	"role" text DEFAULT 'signer' NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"routing_order" integer DEFAULT 1 NOT NULL,
	"client_user_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"signed_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"declined_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "signature_envelope_ref_id" uuid;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "signature_envelope_ref_id" uuid;--> statement-breakpoint
ALTER TABLE "signature_artifacts" ADD CONSTRAINT "signature_artifacts_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_artifacts" ADD CONSTRAINT "signature_artifacts_envelope_id_signature_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."signature_envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_artifacts" ADD CONSTRAINT "signature_artifacts_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_artifacts" ADD CONSTRAINT "signature_artifacts_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD CONSTRAINT "signature_envelopes_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD CONSTRAINT "signature_envelopes_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD CONSTRAINT "signature_envelopes_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_events" ADD CONSTRAINT "signature_events_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_events" ADD CONSTRAINT "signature_events_envelope_id_signature_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."signature_envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_recipients" ADD CONSTRAINT "signature_recipients_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_recipients" ADD CONSTRAINT "signature_recipients_envelope_id_signature_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."signature_envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signature_artifacts_envelope_kind_idx" ON "signature_artifacts" USING btree ("envelope_id","kind");--> statement-breakpoint
CREATE INDEX "signature_artifacts_workspace_envelope_idx" ON "signature_artifacts" USING btree ("workspace_id","envelope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signature_envelopes_workspace_provider_id_idx" ON "signature_envelopes" USING btree ("workspace_id","provider","provider_envelope_id");--> statement-breakpoint
CREATE INDEX "signature_envelopes_workspace_status_idx" ON "signature_envelopes" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "signature_envelopes_workspace_offer_idx" ON "signature_envelopes" USING btree ("workspace_id","offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signature_events_workspace_key_idx" ON "signature_events" USING btree ("workspace_id","event_key");--> statement-breakpoint
CREATE INDEX "signature_events_workspace_envelope_idx" ON "signature_events" USING btree ("workspace_id","envelope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signature_recipients_envelope_provider_id_idx" ON "signature_recipients" USING btree ("envelope_id","provider_recipient_id");--> statement-breakpoint
CREATE INDEX "signature_recipients_workspace_envelope_idx" ON "signature_recipients" USING btree ("workspace_id","envelope_id");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_signature_envelope_ref_id_signature_envelopes_id_fk" FOREIGN KEY ("signature_envelope_ref_id") REFERENCES "public"."signature_envelopes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_signature_envelope_ref_id_signature_envelopes_id_fk" FOREIGN KEY ("signature_envelope_ref_id") REFERENCES "public"."signature_envelopes"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
