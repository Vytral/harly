ALTER TABLE "candidate_deletion_jobs" ADD COLUMN "stats" jsonb;--> statement-breakpoint
ALTER TABLE "candidate_deletion_jobs" ADD COLUMN "duration_ms" integer;