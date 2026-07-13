CREATE TABLE "mail_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"message_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"mailbox_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"candidate_id" uuid,
	"application_id" uuid,
	"imap_uid" integer,
	"message_id" text,
	"in_reply_to" text,
	"references" text,
	"direction" "message_direction" NOT NULL,
	"from_email" text NOT NULL,
	"to_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text NOT NULL,
	"text_body" text NOT NULL,
	"html_body" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"mailbox_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"normalized_subject" text NOT NULL,
	"participant_email" text,
	"candidate_id" uuid,
	"application_id" uuid,
	"owner_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"address" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"imap_host" text NOT NULL,
	"imap_port" integer NOT NULL,
	"imap_tls" boolean DEFAULT true NOT NULL,
	"imap_user" text NOT NULL,
	"imap_password_ciphertext" text NOT NULL,
	"imap_password_iv" text NOT NULL,
	"imap_password_tag" text NOT NULL,
	"source_folder" text DEFAULT 'INBOX' NOT NULL,
	"sent_folder" text,
	"smtp_host" text NOT NULL,
	"smtp_port" integer NOT NULL,
	"smtp_tls" boolean DEFAULT true NOT NULL,
	"smtp_user" text NOT NULL,
	"smtp_password_ciphertext" text NOT NULL,
	"smtp_password_iv" text NOT NULL,
	"smtp_password_tag" text NOT NULL,
	"uid_validity" text,
	"last_uid" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_healthy_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_attachments" ADD CONSTRAINT "mail_attachments_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_attachments" ADD CONSTRAINT "mail_attachments_message_id_mail_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."mail_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_thread_id_mail_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."mail_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_attachments_workspace_message_idx" ON "mail_attachments" USING btree ("workspace_id","message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_messages_mailbox_uid_unique" ON "mail_messages" USING btree ("mailbox_id","imap_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_messages_workspace_message_id_unique" ON "mail_messages" USING btree ("workspace_id","message_id");--> statement-breakpoint
CREATE INDEX "mail_messages_thread_received_idx" ON "mail_messages" USING btree ("thread_id","received_at");--> statement-breakpoint
CREATE INDEX "mail_threads_workspace_status_last_idx" ON "mail_threads" USING btree ("workspace_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "mail_threads_mailbox_participant_idx" ON "mail_threads" USING btree ("mailbox_id","participant_email");--> statement-breakpoint
CREATE INDEX "mail_threads_candidate_idx" ON "mail_threads" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mailboxes_workspace_unique" ON "mailboxes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "mailboxes_workspace_enabled_idx" ON "mailboxes" USING btree ("workspace_id","enabled");