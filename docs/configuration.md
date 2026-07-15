# Configuration

`HARLY_URL` is the canonical public origin. It must be an origin without a
path, for example `https://hiring.example.com`. The old
`NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` variables remain temporary
fallbacks and emit a deprecation warning.

Production startup fails before accepting traffic when any required value is
missing or malformed:

```dotenv
HARLY_URL=https://hiring.example.com
DATABASE_URL=postgresql://user:password@postgres:5432/harly
BETTER_AUTH_SECRET=<independent-32-byte-secret>
AI_ENCRYPTION_KEY=<independent-32-byte-secret>
STORAGE_UPLOAD_SECRET=<independent-32-byte-secret>
CRON_SECRET=<independent-32-byte-secret>
HARLY_SETUP_SECRET=<independent-32-byte-secret>
HARLY_INITIAL_ADMIN_EMAIL=owner@example.com
```

Do not reuse secrets. `create-harly init` generates each independently and
writes `.env` with mode `0600`.

## Storage

`STORAGE_PROVIDER=local` stores files below `UPLOADS_DIR` (`/data/uploads` in
the official image). The directory is validated as writable during startup and
must use the `uploads` volume. For S3, R2, or MinIO set
`STORAGE_PROVIDER=s3` plus `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, and optional `S3_ENDPOINT`/`S3_PUBLIC_URL`.

## Optional integrations

OAuth ID/secret pairs are all-or-nothing. Resend, SMTP, OAuth, IMAP, branding,
Turnstile, and invitations can be configured from Harly after bootstrap.
Turnstile secrets are resolved server-side.

Outbound webhook URLs must use HTTPS and resolve only to public addresses.
Loopback, private, link-local, and metadata networks are blocked before every
request and redirect. `HARLY_ALLOW_PRIVATE_WEBHOOKS=true` is an explicit,
high-trust exception for private networks.

## Cron

The scheduler calls these private endpoints with
`Authorization: Bearer $CRON_SECRET`:

- `POST /api/cron/email-outbox` every 60 seconds
- `POST /api/cron/webhooks/dispatch` every 60 seconds
- `POST /api/cron/mailbox-sync` every 120 seconds

GET and query-string secrets are rejected. Email, SMTP, and webhook delivery
are at-least-once; provider idempotency and durable queue keys reduce duplicate
delivery after crashes.
