ALTER TYPE "public"."activity_entity_type" ADD VALUE 'task';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "tasks_workspace_deleted_idx" ON "tasks" USING btree ("workspace_id","deleted_at");