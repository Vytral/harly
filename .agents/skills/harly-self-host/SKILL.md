---
name: harly-self-host
description: Install, configure, verify, upgrade, back up, restore, or diagnose a self-hosted Harly ATS deployment. Use when a user asks Codex or Claude to deploy Harly on a VPS, Docker host, Railway, Fly.io, or DigitalOcean; to run the Harly installer; or to operate a generated Harly installation.
---

# Harly self-hosting

Operate Harly through its official `@harly/cli` command. Preserve the operator's data, secrets, and existing deployment files.

## Choose the path

- For a Docker VPS, use the CLI's guided installer or its non-interactive environment variables.
- For Railway, Fly.io, or DigitalOcean, use the CLI's cloud option; require managed PostgreSQL and S3-compatible storage.
- For an existing installation, locate `harly.config.json` from the requested directory upward, then use `doctor`, `backup`, `update`, or `restore`.
- For repository development, do not use the production Compose stack. Follow the repository's development commands instead.

Read `references/operations.md` before running deployment commands. If operating from the Harly repository, also read `docs/self-hosting.md` and `docs/configuration.md`.

## VPS installation workflow

1. Confirm the target host, installation directory, public URL, proxy mode, owner email, and storage choice. Never guess a production hostname or overwrite an existing installation. The owner email bootstraps Harly; it is not a TLS certificate contact.
2. Check Node 20.12+, Docker Engine 24+, Compose 2.20+, DNS, ports, and free disk. Let `harly init` repeat these checks.
3. Run `npx @harly/cli` interactively, or use non-interactive `harly init <directory>` only with the required environment variables. Do not place secrets in command-line arguments or logs.
4. Verify `npx @harly/cli doctor <directory>` and the public `/api/health/ready` endpoint.
5. Tell the operator to complete `/setup` with `HARLY_SETUP_SECRET`; do not print the secret.

## Safe operations

- Run `doctor` before and after an upgrade or restore.
- Create a backup before changing images, configuration, or volumes. Local archives are rollback points, not off-host disaster recovery.
- Require explicit confirmation before `restore --force` or `uninstall --remove-data`. State the exact installation directory and archive first.
- Treat migrations as forward-only. If an upgrade has migrated the database and is unhealthy, use the preserved backup to restore; do not flip only the image tag.
- For S3 storage, explain that Harly archives do not include bucket objects; verify bucket versioning or an independent backup.

## Diagnosis

Use `doctor` first. Then inspect `docker compose ps`, recent app/scheduler logs, readiness, scheduler doctor output, disk capacity, and external backup freshness. Do not call cron HTTP endpoints manually and never expose `CRON_SECRET` in a URL.

## Completion

Report the deployment URL, selected image/digest, proxy mode, storage type, doctor result, and any remaining operator action. Never include `.env` contents, secrets, database URLs, or backup encryption identities.
