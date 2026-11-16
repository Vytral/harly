DROP INDEX "jobs_workspace_slug_idx";--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "mime_type" text;--> statement-breakpoint
CREATE INDEX "candidate_messages_application_idx" ON "candidate_messages" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "evaluation_jobs_job_idx" ON "evaluation_jobs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "evaluation_jobs_candidate_idx" ON "evaluation_jobs" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "evaluation_jobs_application_idx" ON "evaluation_jobs" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "mail_messages_candidate_idx" ON "mail_messages" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "mail_messages_application_idx" ON "mail_messages" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "mail_threads_application_idx" ON "mail_threads" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_workspace_slug_idx" ON "jobs" USING btree ("workspace_id","slug") WHERE "jobs"."deleted_at" is null;