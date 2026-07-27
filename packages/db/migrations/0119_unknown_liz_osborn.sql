CREATE TABLE "candidate_demographics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"gender" text,
	"ethnicity" text,
	"disability" text,
	"veteran_status" text,
	"consent_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'self_reported' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_demographics" ADD CONSTRAINT "candidate_demographics_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_demographics" ADD CONSTRAINT "candidate_demographics_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_demographics_candidate_uidx" ON "candidate_demographics" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_demographics_workspace_idx" ON "candidate_demographics" USING btree ("workspace_id");