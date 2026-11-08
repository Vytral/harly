CREATE TABLE IF NOT EXISTS "candidate_portal_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"candidate_id" uuid,
	"challenge" text NOT NULL,
	"type" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_portal_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_portal_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_portal_credentials" (
	"candidate_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"password_hash" text NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_portal_passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"credential_public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"transports" text,
	"name" text DEFAULT 'Passkey' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_portal_passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "portal_auth_methods" jsonb;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "candidate_portal_challenges" ADD CONSTRAINT "candidate_portal_challenges_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "candidate_portal_challenges" ADD CONSTRAINT "candidate_portal_challenges_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "candidate_portal_codes" ADD CONSTRAINT "candidate_portal_codes_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "candidate_portal_codes" ADD CONSTRAINT "candidate_portal_codes_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "candidate_portal_credentials" ADD CONSTRAINT "candidate_portal_credentials_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "candidate_portal_credentials" ADD CONSTRAINT "candidate_portal_credentials_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "candidate_portal_passkeys" ADD CONSTRAINT "candidate_portal_passkeys_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "candidate_portal_passkeys" ADD CONSTRAINT "candidate_portal_passkeys_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidate_portal_codes_candidate_kind_idx" ON "candidate_portal_codes" USING btree ("candidate_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidate_portal_credentials_workspace_idx" ON "candidate_portal_credentials" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidate_portal_passkeys_candidate_idx" ON "candidate_portal_passkeys" USING btree ("candidate_id");
--> statement-breakpoint
-- Preserve behaviour of existing workspaces: they keep magic link and any OAuth
-- provider they already had; password and access codes are added only where no
-- external method is configured, so the portal never ends up unusable.
UPDATE "workspace_settings" SET "portal_auth_methods" = jsonb_build_object(
	'magicLink', true,
	'google', true,
	'github', true,
	'linkedin', true,
	'passkey', false,
	'password', NOT ("email_enabled" OR "portal_google_client_id" IS NOT NULL OR "portal_github_client_id" IS NOT NULL OR "portal_linkedin_client_id" IS NOT NULL),
	'accessCode', NOT ("email_enabled" OR "portal_google_client_id" IS NOT NULL OR "portal_github_client_id" IS NOT NULL OR "portal_linkedin_client_id" IS NOT NULL)
) WHERE "portal_auth_methods" IS NULL;
