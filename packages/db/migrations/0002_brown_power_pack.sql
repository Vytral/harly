CREATE TYPE "public"."hiring_team_role" AS ENUM('recruiter', 'hiring_manager', 'interviewer');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."scorecard_rating" AS ENUM('strong', 'mixed', 'weak');--> statement-breakpoint
CREATE TABLE "candidate_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"author_id" text,
	"direction" "message_direction" DEFAULT 'outbound' NOT NULL,
	"to_email" text NOT NULL,
	"from_email" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "message_status" DEFAULT 'sent' NOT NULL,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"label" text NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_hiring_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "hiring_team_role" DEFAULT 'recruiter' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scorecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"application_id" uuid,
	"stage_id" uuid,
	"stage_name" text,
	"author_id" text NOT NULL,
	"rating" "scorecard_rating" NOT NULL,
	"comment" text,
	"criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_messages" ADD CONSTRAINT "candidate_messages_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_messages" ADD CONSTRAINT "candidate_messages_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_messages" ADD CONSTRAINT "candidate_messages_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_tags" ADD CONSTRAINT "candidate_tags_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_tags" ADD CONSTRAINT "candidate_tags_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_tags" ADD CONSTRAINT "candidate_tags_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_hiring_team" ADD CONSTRAINT "job_hiring_team_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_hiring_team" ADD CONSTRAINT "job_hiring_team_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_hiring_team" ADD CONSTRAINT "job_hiring_team_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_stage_id_job_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."job_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_messages_workspace_idx" ON "candidate_messages" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "candidate_messages_candidate_created_at_idx" ON "candidate_messages" USING btree ("candidate_id","created_at");--> statement-breakpoint
CREATE INDEX "candidate_messages_author_idx" ON "candidate_messages" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_tags_candidate_label_idx" ON "candidate_tags" USING btree ("candidate_id",lower("label"));--> statement-breakpoint
CREATE INDEX "candidate_tags_workspace_idx" ON "candidate_tags" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "candidate_tags_candidate_idx" ON "candidate_tags" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_tags_label_idx" ON "candidate_tags" USING btree ("workspace_id",lower("label"));--> statement-breakpoint
CREATE UNIQUE INDEX "job_hiring_team_job_user_idx" ON "job_hiring_team" USING btree ("job_id","user_id");--> statement-breakpoint
CREATE INDEX "job_hiring_team_workspace_idx" ON "job_hiring_team" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "job_hiring_team_job_idx" ON "job_hiring_team" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_hiring_team_user_idx" ON "job_hiring_team" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scorecards_workspace_idx" ON "scorecards" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "scorecards_candidate_created_at_idx" ON "scorecards" USING btree ("candidate_id","created_at");--> statement-breakpoint
CREATE INDEX "scorecards_application_idx" ON "scorecards" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "scorecards_author_idx" ON "scorecards" USING btree ("author_id");