CREATE TABLE "ai_evaluation_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"application_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "candidate_facts_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "skill_profiles_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "evaluation_metadata_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "criterion_details_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "impact_highlights_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "evaluation_criteria" ADD COLUMN "is_knockout" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluation_criteria" ADD COLUMN "excluded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluation_criteria" ADD COLUMN "source_provenance" jsonb;--> statement-breakpoint
ALTER TABLE "saved_signatures" ADD COLUMN "kind" text DEFAULT 'png' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "vector_signatures_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_evaluation_revisions" ADD CONSTRAINT "ai_evaluation_revisions_evaluation_id_ai_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."ai_evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_evaluation_revisions" ADD CONSTRAINT "ai_evaluation_revisions_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_evaluation_revisions" ADD CONSTRAINT "ai_evaluation_revisions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_evaluation_revisions_evaluation_revision_idx" ON "ai_evaluation_revisions" USING btree ("evaluation_id","revision");--> statement-breakpoint
CREATE INDEX "ai_evaluation_revisions_workspace_application_idx" ON "ai_evaluation_revisions" USING btree ("workspace_id","application_id","created_at");