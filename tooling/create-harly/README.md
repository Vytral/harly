# @harly/create

Bootstrap CLI for self-hosting Harly.

> **Status:** Bootstrap CLI in progress; mail unification is available.

## Existing data migrations

Before upgrading an installation that contains legacy candidate email records,
run a report first and then the explicit migration:

```bash
harly migrate:mail-unification --dry-run
harly migrate:mail-unification
```

The migration is workspace-scoped, idempotent, batch-oriented, and does not
abort when it encounters an orphaned message or an invalid legacy attachment.
Those cases are included in the JSON report for operator review. Take a
database/storage backup before running the real migration.

## Target experience

```bash
npx @harly/create
```

The CLI should help users deploy or self-host Harly with a guided setup for:

- Database (Postgres connection string)
- Storage (local / S3 / R2 / MinIO)
- Email (Resend / SMTP)
- Auth (secret generation, OAuth provider setup)
- Branding (app name, logo)
- Domain configuration
- Deployment target (Docker, Vercel, Railway)
