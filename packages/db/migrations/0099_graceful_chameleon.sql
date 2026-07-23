ALTER TABLE "candidates" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "manual_signed_by_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "manual_signed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "manual_signature_note" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "data_retention_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_manual_signed_by_id_user_id_fk" FOREIGN KEY ("manual_signed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidates_workspace_anonymized_idx" ON "candidates" USING btree ("workspace_id","anonymized_at");