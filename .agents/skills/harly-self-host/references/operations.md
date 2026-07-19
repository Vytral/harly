# Harly operations reference

## Prerequisites

- Docker VPS: Node 20.12+, Docker Engine 24+, Docker Compose 2.20+, 5 GB free disk minimum.
- Caddy mode requires public DNS and free ports 80/443. External and local modes expose only loopback HTTP.
- Managed cloud deploys require managed PostgreSQL and S3-compatible uploads.

## Install

Interactive:

```bash
npx @harly/cli
```

Non-interactive inputs: `HARLY_URL`, `HARLY_INITIAL_ADMIN_EMAIL`, optional `HARLY_PROXY_MODE` (`caddy`, `external`, or `local`), `HARLY_ORGANIZATION`, `HARLY_RESOURCE_PROFILE`, and `HARLY_IMAGE_REF`. S3 additionally requires `STORAGE_PROVIDER=s3`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.

The installer generates `.env` mode `0600`, pins the image to a fixed tag/digest, and creates PostgreSQL, migrate, app, scheduler, optional Caddy, and persistent volumes.

## Verify and diagnose

```bash
npx @harly/cli doctor <installation-directory>
docker compose ps
docker compose logs --tail=100 scheduler
docker compose exec -T scheduler node /app/runtime.mjs doctor
```

Readiness is `GET /api/health/ready`. Scheduler doctor verifies database access, migrations, fresh scheduler runs, and queue counts.

## Backup, upgrade, restore

```bash
npx @harly/cli backup <installation-directory>
npx @harly/cli update <installation-directory> --to <version-or-image> --yes
npx @harly/cli restore <archive> <installation-directory> --force
```

Optional portable encryption uses `AGE_RECIPIENT` for backup and `AGE_IDENTITY` for restore. Do not use shell history or chat output to carry either secret.

`backup` includes PostgreSQL, `.env`, Harly configuration, and local uploads. S3 objects are external. `restore` verifies checksums, makes a safety backup, restores data, reruns migrations, and requires readiness.
