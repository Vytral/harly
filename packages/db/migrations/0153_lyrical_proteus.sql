CREATE TYPE "public"."job_stage_kind" AS ENUM('applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn', 'custom');--> statement-breakpoint
DROP INDEX "job_stages_job_order_idx";--> statement-breakpoint
DROP INDEX "job_stages_job_name_idx";--> statement-breakpoint
ALTER TABLE "job_stages" ADD COLUMN "kind" "job_stage_kind";--> statement-breakpoint
ALTER TABLE "job_stages" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "job_stages_job_order_idx" ON "job_stages" USING btree ("job_id","order") WHERE "job_stages"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "job_stages_job_name_idx" ON "job_stages" USING btree ("job_id","name") WHERE "job_stages"."archived_at" is null;