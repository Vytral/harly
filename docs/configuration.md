# Configuration

Harly reads configuration from environment variables. Start with `.env.example`; values in `.env.local` are ignored by Git.

## Required in production

```dotenv
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://harly.example.com
BETTER_AUTH_URL=https://harly.example.com
BETTER_AUTH_SECRET=<random-32-byte-secret>
DATABASE_URL=postgresql://user:password@host:5432/harly
AI_ENCRYPTION_KEY=<random-32-byte-secret>
```

Generate secrets with:

```bash
openssl rand -base64 32
```

`NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` must use the public HTTPS origin in production. Do not reuse development secrets or commit them to the repository.

## Storage

The default `STORAGE_PROVIDER=local` stores uploads on the application filesystem. This is suitable for local development and a single durable server only. For ephemeral or multi-instance deployments, use `STORAGE_PROVIDER=s3` with an S3-compatible bucket and set `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, and `S3_PUBLIC_URL`.

## Optional integrations

OAuth providers, Resend, AI providers, Slack, Outlook, Turnstile, Redis, and webhook retries are configured through the remaining variables in `.env.example`. Unconfigured optional integrations are disabled or fall back to the local behavior documented in the app.

## Recruiting inbox (IMAP/SMTP)

Configure the self-hosted recruiting inbox per workspace in **Settings → Email → Recruiting inbox**. It supports one shared mailbox such as `jobs@company.com`; IMAP and SMTP passwords are encrypted with `AI_ENCRYPTION_KEY`.

Enter the provider's host, port, TLS setting, username/app-password, source folder (normally `INBOX`), and optional Sent folder. After saving, use **Test connection**. Schedule `GET` or `POST /api/cron/mailbox-sync` every two minutes with `Authorization: Bearer $CRON_SECRET`; the endpoint is deliberately disabled if that secret is absent.

- **Google Workspace/Gmail:** enable IMAP and create an app password (requires 2-Step Verification). Use `imap.gmail.com:993` and `smtp.gmail.com:465` with TLS; folders are commonly `INBOX` and `[Gmail]/Sent Mail`.
- **Microsoft 365:** use an app password when available, or enable SMTP AUTH for the mailbox. Typical values: `outlook.office365.com:993` and `smtp.office365.com:587` (STARTTLS); Sent is usually `Sent Items`.
- **Zoho:** use an app-specific password. Typical values: `imap.zoho.com:993`, `smtp.zoho.com:465`, and `Sent`.
- **Generic IMAP:** use the provider's TLS settings. Only the configured source folder is polled; personal folders are not replicated.

Incoming mail is retained as an unassigned Inbox thread until a recruiter links or creates a candidate/application. AI actions are manual and require confirmation before data is created or a reply is sent.

## Database migrations

Migrations are committed in `packages/db/migrations`. Apply them once per deployment with:

```bash
pnpm db:migrate
```

Run migrations as a release/pre-deploy step, not concurrently from multiple application instances.
