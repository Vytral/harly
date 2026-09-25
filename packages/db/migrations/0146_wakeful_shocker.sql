CREATE TABLE "ai_conversation_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"idempotency_key" text,
	"input" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"lease_until" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_ai_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"workflow_id" uuid,
	"base_revision" integer,
	"base_content_hash" text,
	"local_snapshot_hash" text,
	"name" text NOT NULL,
	"description" text,
	"graph" jsonb NOT NULL,
	"layout" jsonb NOT NULL,
	"operational_policy" jsonb,
	"diff" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"simulation" jsonb,
	"redaction_metadata" jsonb DEFAULT '{"version":1,"secretsRedacted":true}'::jsonb NOT NULL,
	"status" text DEFAULT 'prepared' NOT NULL,
	"apply_action_id" text,
	"applied_revision" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_request_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"application_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"workflow_effect_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"requested_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_request_packages_version_check" CHECK ("document_request_packages"."version" > 0),
	CONSTRAINT "document_request_packages_status_check" CHECK ("document_request_packages"."status" in ('pending', 'completed', 'declined', 'expired', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "workflow_approval_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"execution_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"decision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_approval_votes_decision_check" CHECK ("workflow_approval_votes"."decision" in ('approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "workflow_document_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"format" text DEFAULT 'rich_text' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by_id" text,
	"updated_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"workflow_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"graph" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"layout" jsonb DEFAULT '{"positions":{},"collapsedNodeIds":[]}'::jsonb NOT NULL,
	"updated_by_id" text,
	"content_hash" text NOT NULL,
	"review_hash" text,
	"validation_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_external_action_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"workflow_id" uuid NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_external_action_buckets_reserved_check" CHECK ("workflow_external_action_buckets"."reserved" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workflow_node_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"execution_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"fence_token" bigint NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error_code" text,
	"error_details" jsonb,
	"provider_ref" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "workflow_node_attempts_number_check" CHECK ("workflow_node_attempts"."attempt_no" > 0 and "workflow_node_attempts"."fence_token" > 0),
	CONSTRAINT "workflow_node_attempts_status_check" CHECK ("workflow_node_attempts"."status" in ('running', 'waiting', 'succeeded', 'failed', 'uncertain', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "workflow_node_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input_snapshot" jsonb,
	"output" jsonb,
	"resolved_port" text,
	"error_code" text,
	"error_details" jsonb,
	"retryable" boolean DEFAULT false NOT NULL,
	"waiting_kind" text,
	"waiting_event_name" text,
	"waiting_event_cursor" bigint,
	"waiting_resource_id" text,
	"waiting_resource_type" text,
	"deadline_at" timestamp with time zone,
	"effect_key" text NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_node_executions_status_check" CHECK ("workflow_node_executions"."status" in ('pending', 'running', 'waiting', 'succeeded', 'failed', 'skipped', 'cancelled', 'uncertain'))
);
--> statement-breakpoint
CREATE TABLE "workflow_run_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"workflow_id" uuid NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_run_buckets_reserved_check" CHECK ("workflow_run_buckets"."reserved" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workflow_webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"workflow_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"secret_iv" text NOT NULL,
	"secret_tag" text NOT NULL,
	"payload_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_received_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_webhook_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"external_event_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD COLUMN "retention_until" timestamp with time zone DEFAULT now() + interval '90 days' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD COLUMN "redaction_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "document_requests" ADD COLUMN "package_id" uuid;--> statement-breakpoint
ALTER TABLE "document_requests" ADD COLUMN "workflow_effect_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "workflow_effect_id" text;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "workflow_effect_id" text;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "workflow_effect_id" text;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD COLUMN "workflow_effect_id" text;--> statement-breakpoint
ALTER TABLE "workflow_definition_versions" ADD COLUMN "schema_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definition_versions" ADD COLUMN "graph" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definition_versions" ADD COLUMN "compiler_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definition_versions" ADD COLUMN "content_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definition_versions" ADD COLUMN "layout_snapshot" jsonb DEFAULT '{"positions":{},"collapsedNodeIds":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "engine_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "published_version_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "trigger_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "engine_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "version_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "logical_status" text;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "cursor_node_id" text;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "retry_node_id" text;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "fence_token" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "context_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "root_run_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "lineage_depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "lineage_external_actions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_conversation_candidates" ADD CONSTRAINT "ai_conversation_candidates_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversation_candidates" ADD CONSTRAINT "ai_conversation_candidates_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_ai_jobs" ADD CONSTRAINT "automation_ai_jobs_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_ai_jobs" ADD CONSTRAINT "automation_ai_jobs_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_ai_proposals" ADD CONSTRAINT "automation_ai_proposals_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_ai_proposals" ADD CONSTRAINT "automation_ai_proposals_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_ai_proposals" ADD CONSTRAINT "automation_ai_proposals_workflow_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_request_packages" ADD CONSTRAINT "document_request_packages_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_request_packages" ADD CONSTRAINT "document_request_packages_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_request_packages" ADD CONSTRAINT "document_request_packages_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_request_packages" ADD CONSTRAINT "document_request_packages_requested_by_id_user_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approval_votes" ADD CONSTRAINT "workflow_approval_votes_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_node_executions_workspace_id_uidx" ON "workflow_node_executions" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "workflow_approval_votes" ADD CONSTRAINT "workflow_approval_votes_workspace_id_execution_id_workflow_node_executions_workspace_id_id_fk" FOREIGN KEY ("workspace_id","execution_id") REFERENCES "public"."workflow_node_executions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_document_templates" ADD CONSTRAINT "workflow_document_templates_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_document_templates" ADD CONSTRAINT "workflow_document_templates_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_document_templates" ADD CONSTRAINT "workflow_document_templates_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_drafts" ADD CONSTRAINT "workflow_drafts_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_drafts" ADD CONSTRAINT "workflow_drafts_workflow_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_drafts" ADD CONSTRAINT "workflow_drafts_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_external_action_buckets" ADD CONSTRAINT "workflow_external_action_buckets_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_external_action_buckets" ADD CONSTRAINT "workflow_external_action_buckets_workflow_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_node_attempts" ADD CONSTRAINT "workflow_node_attempts_workspace_id_execution_id_workflow_node_executions_workspace_id_id_fk" FOREIGN KEY ("workspace_id","execution_id") REFERENCES "public"."workflow_node_executions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_runs_workspace_id_uidx" ON "workflow_runs" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "workflow_node_executions" ADD CONSTRAINT "workflow_node_executions_workspace_id_run_id_workflow_runs_workspace_id_id_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."workflow_runs"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_buckets" ADD CONSTRAINT "workflow_run_buckets_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run_buckets" ADD CONSTRAINT "workflow_run_buckets_workflow_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_webhook_endpoints" ADD CONSTRAINT "workflow_webhook_endpoints_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_webhook_endpoints" ADD CONSTRAINT "workflow_webhook_endpoints_workflow_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_webhook_endpoints" ADD CONSTRAINT "workflow_webhook_endpoints_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_webhook_receipts" ADD CONSTRAINT "workflow_webhook_receipts_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_webhook_receipts" ADD CONSTRAINT "workflow_webhook_receipts_endpoint_id_workflow_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."workflow_webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_conversation_candidates_pair_uidx" ON "ai_conversation_candidates" USING btree ("conversation_id","candidate_id");--> statement-breakpoint
CREATE INDEX "ai_conversation_candidates_candidate_idx" ON "ai_conversation_candidates" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_ai_jobs_workspace_idempotency_uidx" ON "automation_ai_jobs" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "automation_ai_jobs_queue_idx" ON "automation_ai_jobs" USING btree ("status","available_at","lease_until");--> statement-breakpoint
CREATE INDEX "automation_ai_jobs_workspace_created_idx" ON "automation_ai_jobs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_ai_proposals_workspace_actor_idx" ON "automation_ai_proposals" USING btree ("workspace_id","actor_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_ai_proposals_workflow_idx" ON "automation_ai_proposals" USING btree ("workspace_id","workflow_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_ai_proposals_workspace_action_uidx" ON "automation_ai_proposals" USING btree ("workspace_id","apply_action_id");--> statement-breakpoint
CREATE INDEX "automation_ai_proposals_expires_idx" ON "automation_ai_proposals" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "document_request_packages_workspace_application_idx" ON "document_request_packages" USING btree ("workspace_id","application_id","created_at");--> statement-breakpoint
CREATE INDEX "document_request_packages_workspace_status_idx" ON "document_request_packages" USING btree ("workspace_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_request_packages_workspace_effect_uidx" ON "document_request_packages" USING btree ("workspace_id","workflow_effect_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_approval_votes_execution_actor_uidx" ON "workflow_approval_votes" USING btree ("execution_id","actor_id");--> statement-breakpoint
CREATE INDEX "workflow_approval_votes_workspace_execution_idx" ON "workflow_approval_votes" USING btree ("workspace_id","execution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_document_templates_workspace_name_idx" ON "workflow_document_templates" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "workflow_document_templates_workspace_updated_idx" ON "workflow_document_templates" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "workflow_document_templates_workspace_active_idx" ON "workflow_document_templates" USING btree ("workspace_id","archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_drafts_workflow_uidx" ON "workflow_drafts" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_drafts_workspace_updated_idx" ON "workflow_drafts" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_external_action_buckets_window_uidx" ON "workflow_external_action_buckets" USING btree ("workspace_id","workflow_id","bucket_start");--> statement-breakpoint
CREATE INDEX "workflow_external_action_buckets_cleanup_idx" ON "workflow_external_action_buckets" USING btree ("bucket_start");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_node_attempts_execution_attempt_uidx" ON "workflow_node_attempts" USING btree ("execution_id","attempt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_node_executions_run_node_uidx" ON "workflow_node_executions" USING btree ("run_id","node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_node_executions_effect_uidx" ON "workflow_node_executions" USING btree ("effect_key");--> statement-breakpoint
CREATE INDEX "workflow_node_executions_event_wait_idx" ON "workflow_node_executions" USING btree ("workspace_id","waiting_event_name","waiting_event_cursor") WHERE "workflow_node_executions"."status" = 'waiting' and "workflow_node_executions"."waiting_kind" = 'event';--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_run_buckets_window_uidx" ON "workflow_run_buckets" USING btree ("workspace_id","workflow_id","bucket_start");--> statement-breakpoint
CREATE INDEX "workflow_run_buckets_cleanup_idx" ON "workflow_run_buckets" USING btree ("bucket_start");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_webhook_endpoints_workspace_token_uidx" ON "workflow_webhook_endpoints" USING btree ("workspace_id","token_hash");--> statement-breakpoint
CREATE INDEX "workflow_webhook_endpoints_workspace_workflow_idx" ON "workflow_webhook_endpoints" USING btree ("workspace_id","workflow_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_webhook_receipts_endpoint_event_uidx" ON "workflow_webhook_receipts" USING btree ("endpoint_id","external_event_id");--> statement-breakpoint
CREATE INDEX "workflow_webhook_receipts_workspace_received_idx" ON "workflow_webhook_receipts" USING btree ("workspace_id","received_at");--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_package_id_document_request_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."document_request_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_version_id_workflow_definition_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."workflow_definition_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversations_retention_idx" ON "ai_conversations" USING btree ("retention_until");--> statement-breakpoint
CREATE INDEX "document_requests_package_idx" ON "document_requests" USING btree ("package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_requests_workspace_effect_uidx" ON "document_requests" USING btree ("workspace_id","workflow_effect_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_workspace_workflow_effect_uidx" ON "documents" USING btree ("workspace_id","workflow_effect_id");--> statement-breakpoint
CREATE INDEX "domain_event_outbox_workspace_event_id_idx" ON "domain_event_outbox" USING btree ("workspace_id","event_name","id");--> statement-breakpoint
CREATE UNIQUE INDEX "interviews_workspace_workflow_effect_uidx" ON "interviews" USING btree ("workspace_id","workflow_effect_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_workspace_workflow_effect_uidx" ON "offers" USING btree ("workspace_id","workflow_effect_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signature_envelopes_workspace_effect_uidx" ON "signature_envelopes" USING btree ("workspace_id","workflow_effect_id");--> statement-breakpoint
CREATE INDEX "workflow_definition_versions_content_hash_idx" ON "workflow_definition_versions" USING btree ("workspace_id","content_hash");--> statement-breakpoint
CREATE INDEX "workflow_definitions_published_version_idx" ON "workflow_definitions" USING btree ("published_version_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_root_idx" ON "workflow_runs" USING btree ("workspace_id","root_run_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_v2_queue_idx" ON "workflow_runs" USING btree ("engine_version","logical_status","next_attempt_at","lease_until");--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_engine_version_check" CHECK ("workflow_runs"."engine_version" in (1, 2));--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_v2_state_check" CHECK ("workflow_runs"."engine_version" = 1 or ("workflow_runs"."version_id" is not null and "workflow_runs"."logical_status" is not null and "workflow_runs"."logical_status" in ('queued', 'running', 'waiting', 'retrying', 'succeeded', 'completed_with_warnings', 'stopped', 'failed', 'uncertain', 'cancelled')));
