CREATE TYPE "public"."pool_entry_source" AS ENUM('applied', 'imported', 'sourced', 'referred');--> statement-breakpoint
CREATE TABLE "pool_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"job_id" uuid,
	"reason" text,
	"source" "pool_entry_source" DEFAULT 'applied' NOT NULL,
	"added_by_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "skills" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "experience_years" integer;--> statement-breakpoint
ALTER TABLE "pool_entries" ADD CONSTRAINT "pool_entries_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_entries" ADD CONSTRAINT "pool_entries_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_entries" ADD CONSTRAINT "pool_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_entries" ADD CONSTRAINT "pool_entries_added_by_id_user_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pool_entries_workspace_candidate_idx" ON "pool_entries" USING btree ("workspace_id","candidate_id","removed_at");--> statement-breakpoint
CREATE INDEX "pool_entries_workspace_idx" ON "pool_entries" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "pool_entries_candidate_idx" ON "pool_entries" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "pool_entries_job_idx" ON "pool_entries" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "pool_entries_added_at_idx" ON "pool_entries" USING btree ("workspace_id","added_at");--> statement-breakpoint
CREATE INDEX "candidates_skills_idx" ON "candidates" USING gin ("skills");