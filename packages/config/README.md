# @harly/config

Shared, fail-fast runtime configuration for the web app, migrator, scheduler,
and self-hosting tooling. The package parses environment variables with Zod,
resolves the canonical public origin, validates production requirements, and
checks the local upload directory when local storage is enabled.

```ts
import {
  formatConfigError,
  loadHarlyConfig,
  validateRuntimeFilesystem,
} from "@harly/config";

try {
  const config = loadHarlyConfig();
  await validateRuntimeFilesystem(config);
} catch (error) {
  console.error(formatConfigError(error));
  process.exit(1);
}
```

## Canonical URL

`HARLY_URL` is the canonical public origin and should be the only URL variable
set in a new deployment. `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` are
deprecated fallbacks, resolved in that order when `HARLY_URL` is absent. The
resolved value must be an absolute HTTP(S) origin with no path, credentials,
query, or fragment. It is normalized without a trailing slash.

Production requires HTTPS, except for `localhost` and `127.0.0.1`.

## Environment variables

| Variable | Default | Required | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` | Production: yes | Accepted values: `development`, `test`, `production`. |
| `HARLY_URL` | — | Yes, directly or via fallback | Public HTTP(S) origin. Prefer this variable. |
| `NEXT_PUBLIC_APP_URL` | — | Fallback only | Deprecated public URL fallback. |
| `BETTER_AUTH_URL` | — | Fallback only | Deprecated auth URL fallback. |
| `DATABASE_URL` | — | Production | PostgreSQL connection string consumed by the app and workers. |
| `BETTER_AUTH_SECRET` | — | Production | Authentication signing secret; at least 32 bytes in production. |
| `AI_ENCRYPTION_KEY` | — | Production | Encryption key for workspace/provider secrets; at least 32 bytes in production. |
| `STORAGE_UPLOAD_SECRET` | — | Production | Upload signing secret; at least 32 bytes in production. |
| `CRON_SECRET` | — | Production | Authorizes scheduled worker endpoints; at least 32 bytes in production. |
| `HARLY_SETUP_SECRET` | — | Production | Protects first-run setup; at least 32 bytes in production. |
| `HARLY_INITIAL_ADMIN_EMAIL` | — | Production | Valid email for the initial owner. |
| `HARLY_VERSION` | `0.1.0-dev` | No | Version label exposed to the runtime and self-hosting tooling. |
| `STORAGE_PROVIDER` | `local` | No | Accepted values: `local`, `s3`. |
| `UPLOADS_DIR` | `uploads` | No | Local upload directory, resolved relative to the process working directory. |
| `S3_BUCKET` | — | When `STORAGE_PROVIDER=s3` | S3-compatible bucket name. |
| `S3_REGION` | — | When `STORAGE_PROVIDER=s3` | S3-compatible region. |
| `S3_ACCESS_KEY_ID` | — | When `STORAGE_PROVIDER=s3` | S3-compatible access key. |
| `S3_SECRET_ACCESS_KEY` | — | When `STORAGE_PROVIDER=s3` | S3-compatible secret key. |
| `S3_ENDPOINT` | — | No | Optional S3-compatible endpoint, such as R2 or MinIO. |
| `S3_PUBLIC_URL` | — | No | Optional public URL for storage assets; do not use it to expose private resumes. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | No | Must be configured together for Google OAuth. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — | No | Must be configured together for GitHub OAuth. |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | — | No | Must be configured together for LinkedIn OAuth. |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | — | No | Must be configured together for Microsoft OAuth. |
| `HARLY_ALLOW_PRIVATE_WEBHOOKS` | `false` | No | Set the literal string `true` only for controlled internal webhook targets. |

## Validation behavior

- Missing `HARLY_URL` (including all fallback variables) fails immediately.
- Production checks every required variable and validates the five secret
  values for at least 32 bytes of entropy.
- OAuth credentials must be supplied as complete ID/secret pairs.
- S3 storage fails fast when any of its four required connection variables is
  absent.
- `validateRuntimeFilesystem()` creates `UPLOADS_DIR` when using local storage
  and verifies read/write access. It does nothing for S3 storage.

`formatConfigError()` converts Zod errors into one readable `VARIABLE: message`
line per failure. Keep secrets out of logs and do not commit `.env` files.
