ALTER TABLE "signature_envelopes" ADD COLUMN "last_reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD COLUMN "next_reconcile_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD COLUMN "reconcile_locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD COLUMN "reconcile_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD COLUMN "reconcile_error" text;--> statement-breakpoint
CREATE INDEX "signature_envelopes_reconcile_idx" ON "signature_envelopes" USING btree ("workspace_id","status","next_reconcile_at");