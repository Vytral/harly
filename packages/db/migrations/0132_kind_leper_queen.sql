CREATE INDEX "application_stage_history_workspace_created_idx" ON "application_stage_history" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_workspace_job_applied_idx" ON "applications" USING btree ("workspace_id","job_id","applied_at");--> statement-breakpoint
CREATE INDEX "candidate_tags_workspace_label_candidate_idx" ON "candidate_tags" USING btree ("workspace_id",lower("label"),"candidate_id");--> statement-breakpoint
CREATE INDEX "candidates_workspace_deleted_updated_idx" ON "candidates" USING btree ("workspace_id","deleted_at","updated_at");--> statement-breakpoint
CREATE INDEX "jobs_workspace_deleted_created_idx" ON "jobs" USING btree ("workspace_id","deleted_at","created_at");