CREATE TABLE "workflow_external_action_refunds" (
	"reservation_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"workflow_id" uuid NOT NULL,
	"root_run_id" uuid NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"refunded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_external_action_refunds" ADD CONSTRAINT "workflow_external_action_refunds_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_external_action_refunds" ADD CONSTRAINT "workflow_external_action_refunds_workflow_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_external_action_refunds" ADD CONSTRAINT "workflow_external_action_refunds_root_run_id_workflow_runs_id_fk" FOREIGN KEY ("root_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_external_action_refunds_cleanup_idx" ON "workflow_external_action_refunds" USING btree ("refunded_at");