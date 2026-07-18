# Production launch checklist

Use this checklist before inviting real recruiting teams or importing candidate data.

## Release candidate

- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass from a clean checkout.
- [ ] `pnpm build` completes with production environment values.
- [ ] `pnpm exec drizzle-kit check --config packages/db/drizzle.config.ts` passes.
- [ ] The image/CLI smoke checks pass for the version you intend to publish.
- [ ] The changelog calls out migrations, breaking changes, and operator actions.

## Deployment

- [ ] Use a HTTPS `HARLY_URL` with the correct public domain; never use a path suffix.
- [ ] Generate unique `BETTER_AUTH_SECRET`, `AI_ENCRYPTION_KEY`, `STORAGE_UPLOAD_SECRET`, `CRON_SECRET`, and `HARLY_SETUP_SECRET` values.
- [ ] Keep `.env` readable only by the deployment owner and never commit it.
- [ ] Run `npx @harly/cli doctor` after the first deployment and after upgrades.
- [ ] Confirm `/api/health/ready` returns HTTP 200 after migrations finish.
- [ ] Complete `/setup` with the expected initial owner email, then confirm registration is invite-only.

## Data protection

- [ ] Configure local persistent storage or an S3-compatible bucket; do not use ephemeral container storage for uploads.
- [ ] Make encrypted, off-host backups of PostgreSQL and uploads.
- [ ] Run a restore drill in a disposable installation before production reliance.
- [ ] Review data retention, candidate notice, consent, and AI settings with your organization.
- [ ] Use the minimum required scopes for API keys, ATS imports, OAuth applications, and webhooks.

## Operational handoff

- [ ] Configure email and calendar integrations only after verifying their sender/domain settings.
- [ ] Set a recurring scheduler for the documented cron endpoints when not using the bundled scheduler.
- [ ] Decide who owns upgrades, secret rotation, backup verification, and vulnerability response.
- [ ] Add a public issue template or discussion channel before inviting external contributors.

Harly is self-hosted software, not a managed service. The operator remains responsible for infrastructure availability, recovery, and legal compliance.
