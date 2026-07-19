# Skill: harly-self-host

# Harly self-hosting

Operate Harly through its official `@harly/cli` command. Preserve the operator's data, secrets, and existing deployment files.

## Choose the path

- For a Docker VPS, use the CLI's guided installer or its non-interactive environment variables.
- For Railway, Fly.io, or DigitalOcean, use the CLI's cloud option; require managed PostgreSQL and S3-compatible storage.
- For an existing installation, locate `harly.config.json` from the requested directory upward, then use `doctor`, `backup`, `update`, or `restore`.
- For repository development, do not use the production Compose stack. Follow the repository's development commands instead.

Read `references/operations.md` before running deployment commands. If operating from the Harly repository, also read `docs/self-hosting.md` and `docs/configuration.md`.

## Prerequisites check

Before any installation, verify these on the target host:

```bash
# Node.js 20.12+
node --version  # Must be >=20.12.0

# Docker Engine 24+
docker --version  # Must be >=24.0.0

# Docker Compose 2.20+
docker compose version  # Must be >=2.20.0

# Free disk (5 GB minimum)
df -h / | tail -1 | awk '{print $4}'

# Ports 80/443 available (Caddy mode)
ss -tlnp | grep -E ':80|:443'

# DNS resolution
dig +short your-domain.com
```

## VPS installation workflow

1. Confirm the target host, installation directory, public URL, proxy mode, owner email, and storage choice. Never guess a production hostname or overwrite an existing installation. The owner email bootstraps Harly; it is not a TLS certificate contact.
2. Check Node 20.12+, Docker Engine 24+, Compose 2.20+, DNS, ports, and free disk. Let `harly init` repeat these checks.
3. Run `npx @harly/cli` interactively, or use non-interactive `harly init <directory>` only with the required environment variables. Do not place secrets in command-line arguments or logs.
4. Verify `npx @harly/cli doctor <directory>` and the public `/api/health/ready` endpoint.
5. Print `HARLY_SETUP_SECRET` for the operator to complete `/setup`. Only suppress the secret in shared logs, CI output, or chat transcripts — in a direct session, the operator needs it immediately.

### Resource profiles

The CLI detects host resources and recommends a profile:

| Profile | RAM | Use case |
|---------|-----|----------|
| `compact` | 2 GB + swap | Trials, light traffic, evaluation |
| `standard` | 4 GB | Small-team production (recommended) |
| `performance` | 8 GB+ | High-traffic, large teams |

### Non-interactive installation

For automation, provide configuration through environment variables:

```bash
export HARLY_URL="https://harly.example.com"
export HARLY_INITIAL_ADMIN_EMAIL="admin@example.com"
export HARLY_PROXY_MODE="caddy"  # caddy | external | local
export HARLY_ORGANIZATION="My Company"
export HARLY_RESOURCE_PROFILE="standard"
export HARLY_IMAGE_REF="ghcr.io/vytral/harly:latest"

npx @harly/cli init /opt/harly --yes
```

The `--yes` flag is required when stdin is not interactive; without it, the command exits with code `2`.

### S3 storage configuration

When using S3-compatible storage, add these environment variables:

```bash
export STORAGE_PROVIDER="s3"
export S3_BUCKET="harly-uploads"
export S3_ACCESS_KEY_ID="AKIA..."
export S3_SECRET_ACCESS_KEY="..."
```

## Safe operations

- Run `doctor` before and after an upgrade or restore.
- Create a backup before changing images, configuration, or volumes. Local archives are rollback points, not off-host disaster recovery.
- Require explicit confirmation before `restore --force` or `uninstall --remove-data`. State the exact installation directory and archive first.
- Treat migrations as forward-only. If an upgrade has migrated the database and is unhealthy, use the preserved backup to restore; do not flip only the image tag.
- For S3 storage, explain that Harly archives do not include bucket objects; verify bucket versioning or an independent backup.

### Backup encryption (optional)

For portable encryption, use `age`:

```bash
# During backup
npx @harly/cli backup /opt/harly --encrypt --age-recipient "age1..."

# During restore
npx @harly/cli restore archive.tar.gz /opt/harly --force --age-identity "~/.age/key.txt"
```

Do not use shell history or chat output to carry either secret.

## Diagnosis

Use `doctor` first. Then inspect `docker compose ps`, recent app/scheduler logs, readiness, scheduler doctor output, disk capacity, and external backup freshness. Do not call cron HTTP endpoints manually and never expose `CRON_SECRET` in a URL.

### Doctor output reference

A healthy system shows:

```bash
$ npx @harly/cli doctor /opt/harly

✓ Docker Engine 24.0.1
✓ Docker Compose 2.20.2
✓ Node.js 20.12.0
✓ Disk: 42 GB available
✓ Ports: 80/443 free
✓ DNS: harly.example.com → 203.0.113.50
✓ PostgreSQL: connected
✓ Migrations: up to date
✓ Scheduler: last run 2 minutes ago
✓ Health: /api/health/ready OK
```

### Common issues

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `doctor` fails with "Docker not found" | Docker not installed or not in PATH | Install Docker Engine 24+ |
| `doctor` fails with "ports 80/443 in use" | Another service (nginx, Caddy) using ports | Stop the conflicting service or use `--proxy-mode local` |
| `/api/health/ready` returns 503 | App starting or database unreachable | Check `docker compose logs app` and `docker compose logs postgres` |
| Scheduler shows "late" runs | Scheduler container crashed or resource-constrained | Check `docker compose logs scheduler`, consider `performance` profile |
| `restore` fails with checksum error | Archive corrupted during transfer | Re-download or re-create the backup |
| S3 uploads fail | Invalid credentials or bucket policy | Verify S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY |

### Log inspection

```bash
# App logs (last 100 lines)
docker compose logs --tail=100 app

# Scheduler logs
docker compose logs --tail=100 scheduler

# PostgreSQL logs
docker compose logs --tail=100 postgres

# Follow logs in real-time
docker compose logs -f app scheduler
```

## Completion

Report the deployment URL, selected image/digest, proxy mode, storage type, doctor result, and any remaining operator action. Never include `.env` contents, secrets, database URLs, or backup encryption identities.

### Deployment summary template

```
Deployment URL: https://harly.example.com
Image: ghcr.io/vytral/harly@sha256:abc123...
Proxy mode: caddy
Storage: local (PostgreSQL + local uploads)
Doctor: ✓ all checks passed
HARLY_SETUP_SECRET: <print for operator>
Remaining: Complete /setup with HARLY_SETUP_SECRET
```

## Security checklist

- [ ] `.env` file has mode `0600`
- [ ] Secrets are never passed as CLI arguments
- [ ] `CRON_SECRET` is never exposed in URLs or logs
- [ ] Database port (5432) is bound to localhost only
- [ ] S3 credentials are not in version control
- [ ] Backup archives are stored off-host for disaster recovery
- [ ] TLS is enabled via Caddy or external proxy

Base directory for this skill: /Users/maximiliano/Downloads/curious-monkey/skills/harly-self-host
Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.
Note: file list is sampled.

<skill_files>
<file>/Users/maximiliano/Downloads/curious-monkey/skills/harly-self-host/agents/openai.yaml</file>
<file>/Users/maximiliano/Downloads/curious-monkey/skills/harly-self-host/references/operations.md</file>
</skill_files>
