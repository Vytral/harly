ALTER TABLE "signature_envelopes" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD COLUMN "expiration_days" integer;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "signature_recipients" ADD COLUMN "invited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "signature_recipients" ADD COLUMN "viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "signature_recipients" ADD COLUMN "consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "signature_recipients" ADD COLUMN "consent_version" text;--> statement-breakpoint
ALTER TABLE "signature_recipients" ADD COLUMN "reminder_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "signature_recipients" ADD COLUMN "last_reminder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "signature_recipients" ADD COLUMN "previous_token_hashes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "signature_reminder_cadence_days" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "signature_max_reminders" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
CREATE INDEX "signature_recipients_previous_tokens_idx" ON "signature_recipients" USING gin ("previous_token_hashes");--> statement-breakpoint
UPDATE "signature_recipients" SET "invited_at" = COALESCE("updated_at", "created_at") WHERE "invited_at" IS NULL AND "status" IN ('sent', 'signed', 'declined', 'expired', 'voided');
