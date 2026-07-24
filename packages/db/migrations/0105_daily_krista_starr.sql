CREATE TABLE "native_signature_otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"recipient_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signature_evidence_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"envelope_id" uuid NOT NULL,
	"recipient_id" uuid,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"previous_hash" text,
	"current_hash" text NOT NULL,
	"retention_expires_at" timestamp with time zone,
	"legal_hold" boolean DEFAULT false NOT NULL,
	"redacted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "signature_artifacts" ADD COLUMN "certificate_version" integer;--> statement-breakpoint
ALTER TABLE "signature_artifacts" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "signature_recipients" ADD COLUMN "link_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "native_sign_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "remote_sign_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "saved_signatures_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "signature_otp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "signature_timeline_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "signature_security_mode" text DEFAULT 'link_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "signature_expiration_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "native_signature_otp_challenges" ADD CONSTRAINT "native_signature_otp_challenges_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_signature_otp_challenges" ADD CONSTRAINT "native_signature_otp_challenges_recipient_id_signature_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."signature_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_signatures" ADD CONSTRAINT "saved_signatures_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_evidence_events" ADD CONSTRAINT "signature_evidence_events_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_evidence_events" ADD CONSTRAINT "signature_evidence_events_envelope_id_signature_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."signature_envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_evidence_events" ADD CONSTRAINT "signature_evidence_events_recipient_id_signature_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."signature_recipients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "native_signature_otp_recipient_idx" ON "native_signature_otp_challenges" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "native_signature_otp_expiry_idx" ON "native_signature_otp_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "saved_signatures_workspace_owner_idx" ON "saved_signatures" USING btree ("workspace_id","owner_type","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signature_evidence_event_hash_idx" ON "signature_evidence_events" USING btree ("current_hash");--> statement-breakpoint
CREATE INDEX "signature_evidence_workspace_envelope_idx" ON "signature_evidence_events" USING btree ("workspace_id","envelope_id","occurred_at");