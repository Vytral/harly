# Self-hosting Harly

Harly is a Next.js server application backed by PostgreSQL. The simplest production topology is one Harly process, one PostgreSQL instance, durable object storage, and a reverse proxy providing HTTPS.

## Local Docker PostgreSQL

The repository's Compose file provisions PostgreSQL 16:

```bash
cp .env.example .env.local
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev:web
```

For a clean local database, use `pnpm db:down`. The named volume is retained unless it is removed manually.

## Production Node process

Build and start the app from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
pnpm --filter web start
```

Put the process behind an HTTPS reverse proxy and make sure the proxy forwards the original host and protocol. Keep `DATABASE_URL`, `BETTER_AUTH_SECRET`, `AI_ENCRYPTION_KEY`, OAuth secrets, email credentials, and storage credentials outside the repository.

## Vercel

1. Import `Vytral/harly` with the deploy button in the root README.
2. Add a managed PostgreSQL provider and set `DATABASE_URL` plus the required auth/app variables.
3. Configure the remaining integrations in the Vercel project settings.
4. Run `pnpm db:migrate` from a trusted CI/release job before serving traffic.
5. If webhook retries are enabled, schedule `/api/cron/webhooks/dispatch` with `Authorization: Bearer $CRON_SECRET`.

Vercel deployments are a good fit for the web process, but local filesystem storage is not a durable production storage strategy there. Use S3-compatible storage for resumes, avatars, and other uploads.

## Railway

1. Create a project from the GitHub repository.
2. Add a PostgreSQL service and reference its `DATABASE_URL` from the Harly service.
3. Set the pre-deploy command to `pnpm db:migrate`.
4. Set the build command to `pnpm build` and the start command to `pnpm --filter web start`.
5. Add the required environment variables and generate a public domain.

Railway can build from the repository or a Dockerfile. Keep PostgreSQL private to the project and configure backups according to your operational requirements.

## Backups and operations

- Back up PostgreSQL before upgrades and test restoring those backups.
- Use S3-compatible storage with lifecycle and retention policies for uploaded files.
- Rotate auth, encryption, OAuth, email, and webhook secrets when staff or infrastructure changes.
- Monitor application logs, failed webhook deliveries, email delivery, database health, and storage errors.
- Keep the source link and AGPLv3 notices available to users of modified network deployments.
