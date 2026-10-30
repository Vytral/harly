CREATE TABLE "integration_health" (
	"workspace_id" text NOT NULL,
	"integration" text NOT NULL,
	"state" text DEFAULT 'connected' NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_health_pk" PRIMARY KEY("workspace_id","integration"),
	CONSTRAINT "integration_health_state_check" CHECK ("integration_health"."state" in ('connected', 'degraded', 'needs_reconnect', 'error', 'not_connected')),
	CONSTRAINT "integration_health_last_error_length_check" CHECK (char_length("integration_health"."last_error") <= 300)
);
--> statement-breakpoint
CREATE TABLE "sample_data_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setup_checklist_states" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"dismissed_at" timestamp with time zone,
	"skipped_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setup_checklist_states_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "cron_runs" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "integration_health" ADD CONSTRAINT "integration_health_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_data_items" ADD CONSTRAINT "sample_data_items_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_checklist_states" ADD CONSTRAINT "setup_checklist_states_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_checklist_states" ADD CONSTRAINT "setup_checklist_states_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_health_attention_idx" ON "integration_health" USING btree ("workspace_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "sample_data_items_entity_uidx" ON "sample_data_items" USING btree ("workspace_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "sample_data_items_workspace_batch_idx" ON "sample_data_items" USING btree ("workspace_id","batch_id");