CREATE TABLE "candidate_deletion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"candidate_id" uuid,
	"request_id" uuid,
	"dedupe_key" text DEFAULT 'legacy:' || gen_random_uuid()::text NOT NULL,
	"request_type" text DEFAULT 'candidate_delete' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"phase" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"blocked_reason" text,
	"requested_by" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_deletion_jobs" ADD CONSTRAINT "candidate_deletion_jobs_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_deletion_jobs" ADD CONSTRAINT "candidate_deletion_jobs_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_deletion_jobs_workspace_request_idx" ON "candidate_deletion_jobs" USING btree ("workspace_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_deletion_jobs_workspace_dedupe_idx" ON "candidate_deletion_jobs" USING btree ("workspace_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "candidate_deletion_jobs_due_idx" ON "candidate_deletion_jobs" USING btree ("status","next_retry_at","locked_at");--> statement-breakpoint
CREATE INDEX "candidate_deletion_jobs_workspace_candidate_idx" ON "candidate_deletion_jobs" USING btree ("workspace_id","candidate_id");