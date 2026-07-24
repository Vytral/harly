ALTER TABLE "mail_threads" DROP CONSTRAINT "mail_threads_source_mailbox_check";--> statement-breakpoint
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_source_mailbox_check" CHECK (("mail_threads"."source"::text = 'imap' AND "mail_threads"."mailbox_id" IS NOT NULL) OR ("mail_threads"."source"::text IN ('legacy-webhook', 'provider', 'smtp') AND "mail_threads"."mailbox_id" IS NULL));
