CREATE TABLE "evaluation_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rubric_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"importance" text DEFAULT 'preferred' NOT NULL,
	"weight" integer NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"minimum_value" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_criterion_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"criterion_key" text NOT NULL,
	"label" text NOT NULL,
	"status" text NOT NULL,
	"score" integer,
	"weight" integer,
	"evidence" text,
	"evidence_source" text,
	"confidence" integer,
	"missing_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_rubrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"config_hash" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "rubric_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "engine" text DEFAULT 'harly' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "engine_version" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "rubric_version" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "input_hash" text;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "output_hash" text;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "evidence_coverage" integer;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "confidence" integer;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "requires_human_review" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "evaluation_status" text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD COLUMN "rubric_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "evaluation_criteria" ADD CONSTRAINT "evaluation_criteria_rubric_id_evaluation_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."evaluation_rubrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_criterion_results" ADD CONSTRAINT "evaluation_criterion_results_evaluation_id_ai_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."ai_evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_rubrics" ADD CONSTRAINT "evaluation_rubrics_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_rubrics" ADD CONSTRAINT "evaluation_rubrics_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_rubrics" ADD CONSTRAINT "evaluation_rubrics_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_criteria_rubric_key_idx" ON "evaluation_criteria" USING btree ("rubric_id","key");--> statement-breakpoint
CREATE INDEX "evaluation_criteria_rubric_idx" ON "evaluation_criteria" USING btree ("rubric_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_criterion_results_evaluation_key_idx" ON "evaluation_criterion_results" USING btree ("evaluation_id","criterion_key");--> statement-breakpoint
CREATE INDEX "evaluation_criterion_results_evaluation_idx" ON "evaluation_criterion_results" USING btree ("evaluation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_rubrics_workspace_job_version_idx" ON "evaluation_rubrics" USING btree ("workspace_id","job_id","version");--> statement-breakpoint
CREATE INDEX "evaluation_rubrics_workspace_job_status_idx" ON "evaluation_rubrics" USING btree ("workspace_id","job_id","status");--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD CONSTRAINT "ai_evaluations_rubric_id_evaluation_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."evaluation_rubrics"("id") ON DELETE set null ON UPDATE no action;