CREATE TYPE "public"."mail_source" AS ENUM('imap', 'legacy-webhook', 'provider');--> statement-breakpoint
CREATE TABLE "mail_unification_migrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"candidate_message_id" uuid NOT NULL,
	"mail_message_id" uuid,
	"fingerprint" text NOT NULL,
	"status" text DEFAULT 'migrated' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_messages" DROP CONSTRAINT "mail_messages_mailbox_id_mailboxes_id_fk";
--> statement-breakpoint
DROP INDEX "mail_messages_mailbox_uid_unique";--> statement-breakpoint
ALTER TABLE "mail_threads" ALTER COLUMN "mailbox_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD COLUMN "source" "mail_source" DEFAULT 'imap' NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD COLUMN "conversation_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_unification_migrations" ADD CONSTRAINT "mail_unification_migrations_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_unification_migrations" ADD CONSTRAINT "mail_unification_migrations_candidate_message_id_candidate_messages_id_fk" FOREIGN KEY ("candidate_message_id") REFERENCES "public"."candidate_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_unification_migrations" ADD CONSTRAINT "mail_unification_migrations_mail_message_id_mail_messages_id_fk" FOREIGN KEY ("mail_message_id") REFERENCES "public"."mail_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_unification_migrations_candidate_unique" ON "mail_unification_migrations" USING btree ("workspace_id","candidate_message_id");--> statement-breakpoint
CREATE INDEX "mail_unification_migrations_workspace_status_idx" ON "mail_unification_migrations" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_messages_thread_uid_unique" ON "mail_messages" USING btree ("thread_id","imap_uid");--> statement-breakpoint
CREATE INDEX "mail_threads_workspace_conversation_idx" ON "mail_threads" USING btree ("workspace_id","conversation_id");--> statement-breakpoint
ALTER TABLE "mail_messages" DROP COLUMN "mailbox_id";