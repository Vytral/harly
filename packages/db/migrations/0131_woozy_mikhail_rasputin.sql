ALTER TYPE "public"."workflow_run_status" ADD VALUE 'dead_letter';--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD COLUMN "step_index" integer;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "source_event_id" text;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "locked_by" text;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "dead_lettered_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_run_steps_run_step_uidx" ON "workflow_run_steps" USING btree ("run_id","step_index");--> statement-breakpoint
CREATE INDEX "workflow_runs_queue_idx" ON "workflow_runs" USING btree ("status","next_attempt_at","locked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_runs_source_event_uidx" ON "workflow_runs" USING btree ("workspace_id","workflow_id","source_event_id");