CREATE TABLE "workspace_automation_external_action_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_automation_external_action_buckets_reserved_check" CHECK ("workspace_automation_external_action_buckets"."reserved" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workspace_automation_policies" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"max_runs_per_minute" integer DEFAULT 300 NOT NULL,
	"max_external_actions_per_minute" integer DEFAULT 150 NOT NULL,
	"max_concurrent_runs" integer DEFAULT 20 NOT NULL,
	"paused_at" timestamp with time zone,
	"paused_by_id" text,
	"pause_reason" text,
	"updated_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_automation_policies_run_limit_check" CHECK ("workspace_automation_policies"."max_runs_per_minute" > 0),
	CONSTRAINT "workspace_automation_policies_external_limit_check" CHECK ("workspace_automation_policies"."max_external_actions_per_minute" > 0),
	CONSTRAINT "workspace_automation_policies_concurrent_limit_check" CHECK ("workspace_automation_policies"."max_concurrent_runs" > 0)
);
--> statement-breakpoint
CREATE TABLE "workspace_automation_run_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_automation_run_buckets_reserved_check" CHECK ("workspace_automation_run_buckets"."reserved" >= 0)
);
--> statement-breakpoint
ALTER TABLE "workspace_automation_external_action_buckets" ADD CONSTRAINT "workspace_automation_external_action_buckets_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_automation_policies" ADD CONSTRAINT "workspace_automation_policies_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_automation_policies" ADD CONSTRAINT "workspace_automation_policies_paused_by_id_user_id_fk" FOREIGN KEY ("paused_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_automation_policies" ADD CONSTRAINT "workspace_automation_policies_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_automation_run_buckets" ADD CONSTRAINT "workspace_automation_run_buckets_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_automation_external_action_buckets_window_uidx" ON "workspace_automation_external_action_buckets" USING btree ("workspace_id","bucket_start");--> statement-breakpoint
CREATE INDEX "workspace_automation_external_action_buckets_cleanup_idx" ON "workspace_automation_external_action_buckets" USING btree ("bucket_start");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_automation_run_buckets_window_uidx" ON "workspace_automation_run_buckets" USING btree ("workspace_id","bucket_start");--> statement-breakpoint
CREATE INDEX "workspace_automation_run_buckets_cleanup_idx" ON "workspace_automation_run_buckets" USING btree ("bucket_start");