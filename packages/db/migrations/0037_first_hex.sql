CREATE TABLE "candidate_portal_magic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"workspace_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_portal_magic_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "candidate_portal_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_portal_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "candidate_portal_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_portal_magic_links" ADD CONSTRAINT "candidate_portal_magic_links_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_portal_sessions" ADD CONSTRAINT "candidate_portal_sessions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_portal_sessions" ADD CONSTRAINT "candidate_portal_sessions_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_magic_links_email_idx" ON "candidate_portal_magic_links" USING btree ("email","workspace_id");--> statement-breakpoint
CREATE INDEX "portal_magic_links_token_hash_idx" ON "candidate_portal_magic_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "portal_sessions_candidate_idx" ON "candidate_portal_sessions" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "portal_sessions_token_hash_idx" ON "candidate_portal_sessions" USING btree ("token_hash");