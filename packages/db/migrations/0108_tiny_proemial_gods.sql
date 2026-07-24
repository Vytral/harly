CREATE TABLE "member_sender_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"member_id" text NOT NULL,
	"user_id" text NOT NULL,
	"local_part" text NOT NULL,
	"display_name" text,
	"is_manually_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "member_sender_identity" ADD CONSTRAINT "member_sender_identity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_sender_identity" ADD CONSTRAINT "member_sender_identity_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_sender_identity" ADD CONSTRAINT "member_sender_identity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_sender_identity_member_uidx" ON "member_sender_identity" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_sender_identity_org_localpart_uidx" ON "member_sender_identity" USING btree ("organization_id","local_part");--> statement-breakpoint
CREATE INDEX "member_sender_identity_org_idx" ON "member_sender_identity" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;