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
METRICS_TOKEN=<independent-32-byte-secret>
HARLY_SETUP_SECRET=<independent-32-byte-secret>
HARLY_INITIAL_ADMIN_EMAIL=owner@example.com
```

Do not reuse secrets. `harly init` generates each independently and
writes `.env` with mode `0600`.

## Storage

`STORAGE_PROVIDER=local` stores files below `UPLOADS_DIR` (`/data/uploads` in
the official image). The directory is validated as writable during startup and
must use the `uploads` volume. For S3, R2, or MinIO set
`STORAGE_PROVIDER=s3` plus `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, and optional `S3_ENDPOINT`/`S3_PUBLIC_URL`.

## Optional integrations

OAuth ID/secret pairs are all-or-nothing. Most workspace integrations can be
configured from Harly after bootstrap. Google Calendar and Google Meet require
the installation-level Google OAuth client to be configured on the server
first; see the [Google Calendar and Google Meet setup guide](integrations/google-calendar.md).

The OAuth client credentials stay in the server environment. User/workspace
refresh tokens are stored encrypted in PostgreSQL after the workspace admin
connects an account from Settings.

Resend, SMTP, IMAP, branding, Turnstile, and invitations can be configured from
Harly after bootstrap.
Turnstile secrets are resolved server-side.

Outbound webhook URLs must use HTTPS and resolve only to public addresses.
Loopback, private, link-local, and metadata networks are blocked before every
request and redirect. `HARLY_ALLOW_PRIVATE_WEBHOOKS=true` is an explicit,
high-trust exception for private networks.

## Cron

Prometheus scrapes `GET /api/metrics` with `Authorization: Bearer $METRICS_TOKEN`.
The endpoint is never exposed without that token and also exposes operational
queue/cron summaries as JSON when requested with `Accept: application/json`.
Workspace operators can inspect secret-free connector status at
`GET /api/health/integrations` with their Harly session; this reports configured
state and check duration without returning credentials.
Import `docs/observability/prometheus-alerts.yml` into the monitoring stack to
alert on failed cron runs, high SSE p95 latency, and elevated HTTP 5xx rates.

The scheduler calls these private endpoints with
`Authorization: Bearer $CRON_SECRET`:

- `POST /api/cron/email-outbox` every 60 seconds
- `POST /api/cron/domain-events` every 15 seconds (replay committed realtime events after a failed fast publish)
- `POST /api/cron/webhooks/dispatch` every 60 seconds
- `POST /api/cron/interview-sync` every 60 seconds
- `POST /api/cron/mailbox-sync` every 120 seconds
- `POST /api/cron/mail-reconciliation` every 60 seconds

GET and query-string secrets are rejected. Mail reconciliation is report-only
by default; the bundled worker runs it in controlled mode and safely
normalizes stale `sending` rows to `unknown`. It never retries an outcome that
may already have reached the provider. Email, SMTP, and webhook delivery are
at-least-once; provider idempotency and durable queue keys reduce duplicate
delivery after crashes.

## Enterprise access control

Harly uses workspace-scoped RBAC. A custom role combines module/action
permissions with an optional contextual scope:

- `all` or `assigned` jobs;
- allowed departments;
- allowed regions.

Resource guards resolve the active membership and workspace on the server, then
apply the role policy to the job before allowing access to applications,
candidates, interviews, or offers. Role assignment also enforces a privilege
ceiling, so a scoped administrator cannot create a role broader than its own.

Workspace owners can enforce MFA from Settings → Security. OIDC/SAML provider
configuration is owner-gated and secrets are encrypted at rest. Security and
administrative changes are written to the workspace audit log and can be
filtered or exported from the security settings page.

SCIM 2.0 provisioning is available to workspace owners from Settings →
Security. Create a named token, copy it once, and configure the identity
provider with:

```text
Base URL: ${HARLY_URL}/api/scim/v2.0/<workspace-id>
Users endpoint: ${HARLY_URL}/api/scim/v2.0/<workspace-id>/Users
Authentication: HTTP Bearer token
```

SCIM supports idempotent user create/update, active/inactive lifecycle,
department, region, team, manager, title, and safe role mapping. Deactivation
revokes the member's Harly sessions without deleting recruiting history.
The service also exposes the standard discovery resources
`/ServiceProviderConfig`, `/ResourceTypes`, and `/Schemas`.
