CREATE TYPE "public"."workflow_definition_status" AS ENUM('draft', 'published', 'paused');--> statement-breakpoint
ALTER TABLE "workflow_definition_versions" ADD COLUMN "approved_by_id" text;--> statement-breakpoint
ALTER TABLE "workflow_definition_versions" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_definition_versions" ADD COLUMN "published_by_id" text;--> statement-breakpoint
ALTER TABLE "workflow_definition_versions" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_definition_versions" ADD COLUMN "max_runs_per_minute" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definition_versions" ADD COLUMN "max_external_actions_per_minute" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definition_versions" ADD COLUMN "circuit_breaker_threshold" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definition_versions" ADD COLUMN "circuit_breaker_cooldown_seconds" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "status" "workflow_definition_status" DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "approval_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "approved_by_id" text;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "published_by_id" text;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "max_runs_per_minute" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "max_external_actions_per_minute" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "circuit_breaker_threshold" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "circuit_breaker_cooldown_seconds" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "circuit_open_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "start_step_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "replay_of_run_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_definition_versions" ADD CONSTRAINT "workflow_definition_versions_approved_by_id_user_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_definition_versions" ADD CONSTRAINT "workflow_definition_versions_published_by_id_user_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_approved_by_id_user_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_published_by_id_user_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_runs_replay_idx" ON "workflow_runs" USING btree ("replay_of_run_id");