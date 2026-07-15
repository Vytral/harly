CREATE TABLE "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"run_id" uuid NOT NULL,
	"status" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_bootstrap" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"authorized_email" text NOT NULL,
	"claim_id" uuid,
	"claim_expires_at" timestamp with time zone,
	"owner_user_id" text,
	"organization_id" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_bootstrap_singleton_check" CHECK ("deployment_bootstrap"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "locked_by" text;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "dedupe_key" text DEFAULT 'legacy:' || gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "locked_by" text;--> statement-breakpoint
ALTER TABLE "deployment_bootstrap" ADD CONSTRAINT "deployment_bootstrap_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_bootstrap" ADD CONSTRAINT "deployment_bootstrap_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cron_runs_run_id_uidx" ON "cron_runs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "cron_runs_job_created_idx" ON "cron_runs" USING btree ("job","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_outbox_workspace_dedupe_uidx" ON "email_outbox" USING btree ("workspace_id","dedupe_key");