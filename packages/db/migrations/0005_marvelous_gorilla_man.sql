ALTER TABLE "interviews" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "cal_booking_uid" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "cal_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "cal_base_url" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "cal_default_event_type_id" integer;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "cal_api_key_ciphertext" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "cal_api_key_iv" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "cal_api_key_tag" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "cal_webhook_secret" text;--> statement-breakpoint
CREATE UNIQUE INDEX "interviews_cal_booking_uid_idx" ON "interviews" USING btree ("cal_booking_uid");