# Harly Railway template assets

Create a Railway project with these services:

1. **Postgres** — Railway managed PostgreSQL.
2. **Harly** — Docker image `ghcr.io/vytral/harly:0.1.0-beta.2`; apply
   `railway.app.json` as its config-as-code file.
3. **Scheduler** — same image; apply `railway.scheduler.json`.

Set shared secrets once: `BETTER_AUTH_SECRET`, `AI_ENCRYPTION_KEY`,
`STORAGE_UPLOAD_SECRET`, `CRON_SECRET`, `HARLY_SETUP_SECRET`,
`HARLY_INITIAL_ADMIN_EMAIL`, `STORAGE_PROVIDER=s3`, and all S3 variables.
Set `DATABASE_URL=${{Postgres.DATABASE_URL}}` in both Harly and Scheduler.
Set Harly `HARLY_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}`; generate a public
domain before the first deploy, or replace it with your custom HTTPS domain.

The Railway marketplace template should be created from this three-service
project in the Railway template editor. It must keep the GHCR image pinned,
include the managed Postgres service, and never use local uploads or Caddy.
