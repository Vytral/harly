CREATE TYPE "public"."mail_idempotency_status" AS ENUM('pending', 'sending', 'sent', 'failed', 'unknown');--> statement-breakpoint
ALTER TYPE "public"."mail_source" ADD VALUE 'smtp';--> statement-breakpoint
CREATE TABLE "mail_idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"message_id" text NOT NULL,
	"status" "mail_idempotency_status" DEFAULT 'pending' NOT NULL,
	"thread_id" uuid,
	"mail_message_id" uuid,
	"provider_message_id" text,
	"payload_hash" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "mail_unification_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_idempotency_keys" ADD CONSTRAINT "mail_idempotency_keys_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_idempotency_keys" ADD CONSTRAINT "mail_idempotency_keys_thread_id_mail_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."mail_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_idempotency_keys" ADD CONSTRAINT "mail_idempotency_keys_mail_message_id_mail_messages_id_fk" FOREIGN KEY ("mail_message_id") REFERENCES "public"."mail_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_idempotency_workspace_key_unique" ON "mail_idempotency_keys" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "mail_idempotency_workspace_status_idx" ON "mail_idempotency_keys" USING btree ("workspace_id","status");
