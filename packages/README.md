# Harly Packages

Shared packages for the Harly monorepo.

These packages define the stable boundaries that make Harly easy to self-host, customize, and run as managed cloud.

## Packages

| Package | Status | Description |
|---------|--------|-------------|
| `@harly/db` | **Complete** | Drizzle schema (40+ tables, 6 enums), 53 migrations, seed helpers, database client singleton. |
| `@harly/auth` | **Complete** | Better Auth integration — email/password, magic link, Google OAuth, passkeys (WebAuthn), 2FA (TOTP), SSO/OIDC+SAML, organization plugin, workspace membership, roles & permissions. |
| `@harly/api` | **Complete** | Framework-agnostic contracts for REST API v1 — API key auth (harly_pk_/sk_), scopes, pagination, error envelope, HMAC webhook signing. |
| `@harly/emails` | **Complete** | 19 React Email templates + Resend sender (console fallback), AI email drafting, inbound email receiver. |
| `@harly/storage` | **Complete** | Abstract storage adapters — local filesystem + S3/R2/MinIO with presigned URLs. |
| `@harly/config` | **Placeholder** | Environment validation, feature flags, deployment config. |
| `@harly/ui` | **Placeholder** | Shared UI primitives and design tokens. |
| `@harly/validators` | **Placeholder** | Shared Zod schemas for forms and API inputs. |

## Architecture

Each package is independently importable. The web app (`apps/web`) consumes them via workspace protocol (`@harly/*`). Packages should never import from `apps/` or from each other in ways that create cycles.

## Import convention

```ts
// From app code:
import { db } from "@harly/db";
import { auth } from "@harly/auth";
import { sendEmail } from "@harly/emails";
import { getStorageAdapter } from "@harly/storage";
```
