CREATE TYPE "public"."consent_type" AS ENUM('data_processing', 'marketing', 'ai_evaluation');--> statement-breakpoint
CREATE TYPE "public"."dsar_status" AS ENUM('pending', 'processing', 'completed', 'denied');--> statement-breakpoint
CREATE TYPE "public"."dsar_type" AS ENUM('export', 'erasure');--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"application_id" uuid,
	"consent_type" "consent_type" NOT NULL,
	"consent_text" text NOT NULL,
	"granted" boolean NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dsar_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"type" "dsar_type" NOT NULL,
	"status" "dsar_status" DEFAULT 'pending' NOT NULL,
	"requested_by" text,
	"processed_by" text,
	"notes" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_records_workspace_idx" ON "consent_records" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "consent_records_candidate_idx" ON "consent_records" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "consent_records_application_idx" ON "consent_records" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "consent_records_type_idx" ON "consent_records" USING btree ("consent_type");--> statement-breakpoint
CREATE INDEX "dsar_requests_workspace_idx" ON "dsar_requests" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "dsar_requests_candidate_idx" ON "dsar_requests" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "dsar_requests_status_idx" ON "dsar_requests" USING btree ("status");