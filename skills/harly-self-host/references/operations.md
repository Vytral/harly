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

### Doctor checks explained

| Check | What it verifies | Failure action |
|-------|------------------|----------------|
| Docker Engine | Docker daemon running, version >=24.0 | Install/update Docker |
| Docker Compose | Compose plugin available, version >=2.20 | Install/update Compose |
| Node.js | Node >=20.12.0 in PATH | Install Node 20 LTS |
| Disk | >=5 GB free on installation volume | Free disk space |
| Ports | 80/443 available (Caddy mode) | Stop conflicting services |
| DNS | Domain resolves to host IP | Configure DNS A/AAAA records |
| PostgreSQL | Database container running, accepting connections | Check `docker compose logs postgres` |
| Migrations | All migrations applied | Check scheduler logs for errors |
| Scheduler | Last run within expected interval | Restart scheduler container |
| Health | `/api/health/ready` returns 200 | Check app logs |

## Backup, upgrade, restore

```bash
npx @harly/cli backup <installation-directory>
npx @harly/cli update <installation-directory> --to <version-or-image> --yes
npx @harly/cli restore <archive> <installation-directory> --force
```

Optional portable encryption uses `AGE_RECIPIENT` for backup and `AGE_IDENTITY` for restore. Do not use shell history or chat output to carry either secret.

`backup` includes PostgreSQL, `.env`, Harly configuration, and local uploads. S3 objects are external. `restore` verifies checksums, makes a safety backup, restores data, reruns migrations, and requires readiness.

### Backup details

What's included in a backup:
- PostgreSQL database dump
- `.env` file (secrets)
- `harly.config.json` configuration
- Local upload files (if not using S3)

What's NOT included:
- S3 bucket objects (verify bucket versioning separately)
- Docker images (must be pulled again)
- Operating system state

### Update paths

```bash
# Update to latest stable release
npx @harly/cli update /opt/harly --to latest --yes

# Update to specific version
npx @harly/cli update /opt/harly --to 0.3.0 --yes

# Update to edge/preview builds
npx @harly/cli update /opt/harly --to edge --yes

# Update with encrypted backup
npx @harly/cli update /opt/harly --to latest --yes --encrypt --age-recipient "age1..."
```

### Restore process

The restore command:
1. Verifies archive checksums
2. Creates a safety backup of current state
3. Stops running services
4. Restores PostgreSQL database
5. Restores configuration files
6. Restores local uploads
7. Reruns any pending migrations
8. Starts services and waits for readiness

**Critical**: Migrations are forward-only. If an upgrade migrated the database and is unhealthy, use the preserved backup to restore; do not flip only the image tag.

## Diagnosis

Use `doctor` first. Then inspect `docker compose ps`, recent app/scheduler logs, readiness, scheduler doctor output, disk capacity, and external backup freshness. Do not call cron HTTP endpoints manually and never expose `CRON_SECRET` in a URL.

### Quick health check script

```bash
#!/bin/bash
DIR="${1:-.}"

echo "=== Docker Compose Status ==="
cd "$DIR" && docker compose ps

echo -e "\n=== Disk Usage ==="
df -h "$DIR" | tail -1

echo -e "\n=== Recent Scheduler Logs ==="
cd "$DIR" && docker compose logs --tail=10 scheduler

echo -e "\n=== Health Check ==="
curl -sf http://localhost:3000/api/health/ready && echo "OK" || echo "FAILED"
```

### Scheduler doctor

```bash
# Run scheduler's internal doctor
docker compose exec -T scheduler node /app/runtime.mjs doctor

# Expected output for healthy scheduler:
# ✓ Database connection OK
# ✓ Migrations up to date
# ✓ Last scheduler run: 2 minutes ago
# ✓ Queue depth: 0 pending jobs
```

## Completion

Report the deployment URL, selected image/digest, proxy mode, storage type, doctor result, and the `HARLY_SETUP_SECRET` for the operator. Only suppress secrets in shared logs, CI output, or chat transcripts — in a direct session, the operator needs the secret immediately to complete `/setup`.

### Post-installation checklist

- [ ] `doctor` passes all checks
- [ ] `/api/health/ready` returns 200
- [ ] `HARLY_SETUP_SECRET` printed for operator (suppress only in shared logs/CI)
- [ ] Operator has completed `/setup` with `HARLY_SETUP_SECRET`
- [ ] First backup created and verified
- [ ] Off-site backup configured (if required)
- [ ] TLS certificate working (Caddy auto-renews)
