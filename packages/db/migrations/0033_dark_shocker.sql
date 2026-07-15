ALTER TABLE "two_factor" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "two_factor" CASCADE;--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_workspace_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_created_by_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "passkey_challenge_user_id_idx";--> statement-breakpoint
DROP INDEX "passkeys_user_id_idx";--> statement-breakpoint
DROP INDEX "tasks_workspace_owner_status_idx";--> statement-breakpoint
DROP INDEX "tasks_workspace_due_date_idx";--> statement-breakpoint
DROP INDEX "tasks_candidate_idx";--> statement-breakpoint
DROP INDEX "tasks_application_idx";--> statement-breakpoint
DROP INDEX "tasks_job_idx";--> statement-breakpoint
DROP INDEX "audit_logs_action_idx";--> statement-breakpoint
ALTER TABLE "passkeys" ALTER COLUMN "device_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "priority" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "priority" SET DEFAULT 'medium';--> statement-breakpoint
ALTER TABLE "workspace_settings" ALTER COLUMN "chat_events" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_files" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Slack columns are created by 0032_slack_oauth.sql. The original generated
-- migration repeated them, which made a clean migration chain fail here.
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey_challenge" ADD CONSTRAINT "passkey_challenge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_files_candidate_hash_idx" ON "candidate_files" USING btree ("candidate_id","content_hash");--> statement-breakpoint
CREATE INDEX "passkey_challenge_user_type_idx" ON "passkey_challenge" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "passkeys_user_idx" ON "passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_idx" ON "tasks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "tasks_owner_idx" ON "tasks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_status_idx" ON "tasks" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("workspace_id","action");--> statement-breakpoint
DROP TYPE "public"."task_priority";--> statement-breakpoint
DROP TYPE "public"."task_status";
