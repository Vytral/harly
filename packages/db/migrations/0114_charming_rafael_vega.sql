CREATE TYPE "public"."member_status" AS ENUM('active', 'inactive', 'suspended');--> statement-breakpoint
CREATE TABLE "scim_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" text,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scim_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "team" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "manager_member_id" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "status" "member_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "scim_external_id" text;--> statement-breakpoint
ALTER TABLE "scim_tokens" ADD CONSTRAINT "scim_tokens_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_tokens" ADD CONSTRAINT "scim_tokens_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scim_tokens_workspace_idx" ON "scim_tokens" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "scim_tokens_active_idx" ON "scim_tokens" USING btree ("workspace_id","revoked_at");--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_manager_member_id_member_id_fk" FOREIGN KEY ("manager_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_manager_idx" ON "member" USING btree ("manager_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_scim_external_id_idx" ON "member" USING btree ("organization_id","scim_external_id");