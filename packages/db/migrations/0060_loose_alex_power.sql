CREATE TABLE "oauth_state_nonces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"provider" text NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_state_nonces" ADD CONSTRAINT "oauth_state_nonces_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_state_nonces_nonce_idx" ON "oauth_state_nonces" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "oauth_state_nonces_ws_idx" ON "oauth_state_nonces" USING btree ("workspace_id","provider");