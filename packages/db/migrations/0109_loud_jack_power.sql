CREATE TYPE "public"."job_approval_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "job_approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"requester_id" text NOT NULL,
	"approver_id" text NOT NULL,
	"status" "job_approval_status" DEFAULT 'pending' NOT NULL,
	"comment" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_approval_requests" ADD CONSTRAINT "job_approval_requests_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_approval_requests" ADD CONSTRAINT "job_approval_requests_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_approval_requests" ADD CONSTRAINT "job_approval_requests_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_approval_requests" ADD CONSTRAINT "job_approval_requests_approver_id_user_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_approval_requests_workspace_idx" ON "job_approval_requests" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "job_approval_requests_job_idx" ON "job_approval_requests" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_approval_requests_approver_status_idx" ON "job_approval_requests" USING btree ("approver_id","status");