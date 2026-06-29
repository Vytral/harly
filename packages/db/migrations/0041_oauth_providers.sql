-- OAuth providers table for storing SSO credentials per workspace.
-- Secrets are encrypted at rest using AES-256-GCM (same pattern as Slack/Portal).
CREATE TABLE "oauth_providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "provider" text NOT NULL, -- 'google' | 'microsoft' | 'github'
  "client_id" text NOT NULL,
  "client_secret_ciphertext" text,
  "client_secret_iv" text,
  "client_secret_tag" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "oauth_providers_workspace_provider_unique" UNIQUE ("workspace_id", "provider")
);

CREATE INDEX "oauth_providers_workspace_idx" ON "oauth_providers" ("workspace_id");
