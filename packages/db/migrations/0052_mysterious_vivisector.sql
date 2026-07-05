CREATE TABLE "candidate_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"model" text NOT NULL,
	"embedding" jsonb NOT NULL,
	"source_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"model" text NOT NULL,
	"embedding" jsonb NOT NULL,
	"source_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_embeddings" ADD CONSTRAINT "candidate_embeddings_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_embeddings" ADD CONSTRAINT "candidate_embeddings_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_embeddings" ADD CONSTRAINT "job_embeddings_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_embeddings" ADD CONSTRAINT "job_embeddings_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_embeddings_workspace_candidate_idx" ON "candidate_embeddings" USING btree ("workspace_id","candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_embeddings_workspace_idx" ON "candidate_embeddings" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_embeddings_workspace_job_idx" ON "job_embeddings" USING btree ("workspace_id","job_id");--> statement-breakpoint
CREATE INDEX "job_embeddings_workspace_idx" ON "job_embeddings" USING btree ("workspace_id");