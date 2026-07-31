ALTER TYPE "public"."workflow_run_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "workflow_action_effects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"effect_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_notes" ADD COLUMN "workflow_effect_id" text;--> statement-breakpoint
ALTER TABLE "domain_event_outbox" ADD COLUMN "automations_dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "domain_event_outbox" ADD COLUMN "automation_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "domain_event_outbox" ADD COLUMN "automation_last_error" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "workflow_effect_id" text;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "definition_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD COLUMN "effect_key" text;--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD COLUMN "retryable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD COLUMN "attempt_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "definition_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "definition_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_action_effects" ADD CONSTRAINT "workflow_action_effects_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_action_effects" ADD CONSTRAINT "workflow_action_effects_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_action_effects_run_step_uidx" ON "workflow_action_effects" USING btree ("run_id","step_index");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_action_effects_effect_key_uidx" ON "workflow_action_effects" USING btree ("effect_key");--> statement-breakpoint
CREATE INDEX "workflow_action_effects_workspace_status_idx" ON "workflow_action_effects" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_notes_workflow_effect_uidx" ON "candidate_notes" USING btree ("workflow_effect_id");--> statement-breakpoint
CREATE INDEX "domain_event_outbox_automations_pending_idx" ON "domain_event_outbox" USING btree ("automations_dispatched_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_workflow_effect_uidx" ON "tasks" USING btree ("workflow_effect_id");