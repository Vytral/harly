-- SSO Provider table for enterprise SAML/OIDC configuration.
-- Created by @better-auth/sso plugin migration.
-- This table stores SSO provider configurations (OIDC and SAML).
CREATE TABLE IF NOT EXISTS "sso_provider" (
  "id" text PRIMARY KEY,
  "issuer" text NOT NULL,
  "domain" text NOT NULL,
  "oidc_config" text,
  "saml_config" text,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "provider_id" text NOT NULL,
  "organization_id" text REFERENCES "organization"("id") ON DELETE SET NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sso_provider_provider_id_unique" UNIQUE ("provider_id")
);

CREATE INDEX IF NOT EXISTS "sso_provider_domain_idx" ON "sso_provider" ("domain");
CREATE INDEX IF NOT EXISTS "sso_provider_organization_idx" ON "sso_provider" ("organization_id");
