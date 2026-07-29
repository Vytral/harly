CREATE TABLE "slack_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"event" text NOT NULL,
	"channel_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"response_status" integer,
	"slack_error" text,
	"last_error" text,
	"next_retry_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"delivered_at" timestamp with time zone,
	"dead_lettered_at" timestamp with time zone,
	"replay_of_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"delivery_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"status" text NOT NULL,
	"response_status" integer,
	"slack_error" text,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "slack_app_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "slack_bot_user_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "slack_enterprise_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "slack_scopes" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "slack_installer_user_id" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "slack_installed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "slack_last_validated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "slack_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slack_deliveries" ADD CONSTRAINT "slack_deliveries_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_delivery_attempts" ADD CONSTRAINT "slack_delivery_attempts_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_delivery_attempts" ADD CONSTRAINT "slack_delivery_attempts_delivery_id_slack_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."slack_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slack_deliveries_workspace_dedupe_idx" ON "slack_deliveries" USING btree ("workspace_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "slack_deliveries_status_next_retry_idx" ON "slack_deliveries" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "slack_deliveries_workspace_created_idx" ON "slack_deliveries" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_delivery_attempts_delivery_attempt_idx" ON "slack_delivery_attempts" USING btree ("delivery_id","attempt");--> statement-breakpoint
CREATE INDEX "slack_delivery_attempts_workspace_started_idx" ON "slack_delivery_attempts" USING btree ("workspace_id","started_at");