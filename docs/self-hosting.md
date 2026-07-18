# Self-hosting Harly

The supported v1 topology is one Harly app, PostgreSQL 16, one scheduler, and
optional Caddy, all managed by Docker Compose. PostgreSQL has no published
host port.

## VPS requirements

Harly pulls a prebuilt image; the VPS does not compile Next.js or need pnpm.
For a small installation (roughly 1–10 concurrent users):

| Profile | CPU | RAM | Free disk | Use |
| --- | ---: | ---: | ---: | --- |
| Minimum | 2 vCPU | 2 GB + 1 GB swap | 10 GB plus uploads | Trial or very light traffic |
| Recommended | 2 vCPU | 4 GB | 20 GB plus uploads/backups | Normal small-team production |
| Growing team | 4 vCPU | 8 GB | 40 GB+ or S3 | More concurrency and mailbox/AI work |

Use 64-bit Linux (`amd64` or `arm64`), Docker Engine 24+, Compose 2.20+, and
PostgreSQL 16 (bundled by default). Caddy mode also requires public ports 80
and 443 plus working DNS. External/local modes only bind Harly to loopback.
Actual disk capacity must include database growth, attachments and backups;
S3 storage removes attachment growth from the VPS but not database growth.

The generated defaults target the recommended 4 GB profile: app 1536 MB,
PostgreSQL 768 MB, scheduler 256 MB and Caddy 256 MB. These are hard container
ceilings, not reservations. On a 2 GB VPS, use the following in `.env` and
enable 1 GB of swap:

```dotenv
HARLY_APP_MEMORY=1024m
HARLY_APP_NODE_OPTIONS=--max-old-space-size=640
HARLY_POSTGRES_MEMORY=384m
HARLY_MIGRATE_MEMORY=512m
HARLY_SCHEDULER_MEMORY=192m
HARLY_CADDY_MEMORY=128m
```

## Fresh install

Requirements: Node 20.12+, Docker Engine 24+, and Compose 2.20+.

```bash
npx @harly/cli
```

That single command opens the guided installer. It checks the server, asks for
the public URL and first owner, creates the configuration, pulls the image,
runs migrations, starts Harly, and verifies readiness. Once installed, run the
same command from the installation directory (or any child directory) to open
the management menu.

The wizard pins `ghcr.io/vytral/harly` to a version or digest, generates
independent secrets, and prints the exact services, ports, profiles, and
volumes before launch. Re-running `init` preserves `.env` and secrets. Modified
templates are preserved unless `--force` is supplied; `--force` still never
rotates `.env`.

The interactive flow uses a static Harly banner and guided prompts, validates
Docker/ports/DNS/free disk, detects CPU and RAM, recommends `compact`,
`standard`, or `performance`, masks S3 credentials, and defaults to launching
after configuration (you can decline). Caddy obtains and renews HTTPS certificates;
the CLI configures and verifies the installation but does not mint certificates
itself.

Visit `/setup`, enter `HARLY_SETUP_SECRET`, and create the account matching
`HARLY_INITIAL_ADMIN_EMAIL`. The claim lasts 15 minutes. First workspace
creation is a PostgreSQL-locked transaction that creates exactly one owner.
After completion `/setup` is unavailable and registration is invite-only.

## Proxy modes

- `caddy`: `COMPOSE_PROFILES=proxy`; Caddy publishes 80/443 and obtains TLS.
- `external`: only `127.0.0.1:$HARLY_PORT` is published for Nginx/Traefik.
- `local`: the same loopback port is used with an `http://` URL and no TLS.

Caddy is never started in external or local mode. The selected mode is stored
in `harly.config.json`, and `doctor` validates only its expected services.

## Railway and Fly.io

Choose either platform from the initial `npx @harly/cli` wizard. These managed
platforms terminate HTTPS themselves and require S3-compatible uploads; see
[the cloud deployment guide](cloud-deployments.md).

## Health and operation

- `/api/health/live` checks only the process.
- `/api/health/ready` checks PostgreSQL and the required migration with a
  three-second deadline.
- `/api/health` is a readiness-compatible alias.

All public probe responses expose only `status` and `version`. With PostgreSQL
down, liveness remains 200 and readiness becomes 503.

Every service rotates Docker JSON logs (10 MB × 3 files by default). The
Next.js runtime cache is pruned at startup and every six hours, retaining at
most 512 MB and seven days by default. Tune these without editing Compose:

```dotenv
HARLY_LOG_MAX_SIZE=10m
HARLY_LOG_MAX_FILES=3
HARLY_CACHE_MAX_MB=512
HARLY_CACHE_MAX_AGE_DAYS=7
```

### Scheduler and queue runbook

The scheduler is a single, restartable worker. It calls the email outbox and
webhook retry routes every minute and mailbox sync every two minutes. Each route
uses a PostgreSQL advisory lock, so an accidental second scheduler or a retry
after a container restart receives `409 Already running` instead of doing the
same work concurrently. Queue rows that were left `processing` by a crash become
eligible again after five minutes.

The scheduler container's healthcheck runs its built-in doctor. It requires a
recent successful-or-skipped record for **each** scheduled job, not merely a
running container. By default a job is stale after five minutes; change only
when the instance is intentionally suspended for longer:

```dotenv
HARLY_SCHEDULER_STALE_AFTER_SECONDS=300
```

After deployment, restart, or an alert, use these commands from the installation
directory:

```bash
npx @harly/cli doctor
docker compose ps
docker compose logs --tail=100 scheduler
docker compose exec -T scheduler node /app/runtime.mjs doctor
```

The last command reports freshness per job plus email/webhook queue counts. If a
job is stale, first confirm app readiness, then restart only the scheduler with
`docker compose restart scheduler`. Do not manually invoke cron URLs or put
`CRON_SECRET` in a URL. If queue counts grow while scheduler runs are fresh,
fix the corresponding SMTP, webhook destination, or mailbox credentials; retries
remain durable in PostgreSQL. Alert on an unhealthy scheduler, a stale job, and
disk usage/backups failing—not merely on a non-zero queue count.

Uploads and PostgreSQL data are never pruned automatically. Monitor them with
`docker system df -v` and keep encrypted backups outside the VPS.

The image exposes `serve`, `migrate`, `scheduler`, and `doctor`. Runtime
migrations use committed SQL through `drizzle-orm`; Drizzle Kit and the
TypeScript toolchain are build-time only.

## Backup, restore, and upgrade

```bash
AGE_RECIPIENT=age1... npx @harly/cli backup
AGE_IDENTITY=/secure/key.txt AGE_RECIPIENT=age1... npx @harly/cli restore backup.tar.gz.age --force
npx @harly/cli restore backup.tar.gz --force --allow-plaintext
AGE_RECIPIENT=age1... npx @harly/cli update --to 0.1.0-beta.2 --yes
```

Restore verifies every archived file checksum, creates a safety backup before
changing data, stops the app, scheduler and migration services to avoid a
database race, restores PostgreSQL and local uploads, then requires readiness
to succeed. A failed restore keeps the safety archive under `backups/`.

Backup stops app/scheduler, keeps PostgreSQL running, creates `pg_dump -Fc`,
includes local uploads/config and checksums every included file before it can
succeed. Encryption with `age` is required unless plaintext is explicitly
chosen with `--allow-plaintext`. A restore validates the archive and creates a
fresh safety backup before changing data. S3 objects are not embedded in the
archive: use bucket versioning and an off-provider backup policy. Upgrades take
a backup first, run the single migrator, wait for readiness, and finish with
doctor.

Migrations are forward-only. Restore the full backup when a release does not
declare schema-compatible image rollback.

### Verify your backups actually restore (do this before you rely on them)

A backup you have never restored is a guess. Prove recovery end-to-end against a
**throwaway** installation with the destructive harness:

```bash
HARLY_DESTRUCTIVE_OK=1 \
  tooling/create-harly/test/backup-restore.destructive.sh /path/to/installation
```

It seeds known rows and an uploaded object, backs them up, drops the entire
database schema and deletes the upload, restores from the archive, and fails
loudly unless row counts, a content checksum, the owner/user count, and the
upload's SHA-256 all come back identical. It refuses to run without
`HARLY_DESTRUCTIVE_OK=1` because it wipes the database it points at — never aim
it at production.

## Development database

Repository contributors use the separate development Compose file:

```bash
pnpm db:up
pnpm db:migrate
pnpm dev:web
```

It lives at `tooling/docker/compose.dev.yml` and is not the production stack.
Development needs Node 22+, pnpm, Docker, about 4 GB of available RAM and 10 GB
of free disk for a comfortable full-monorepo workflow. Turbopack's persistent
filesystem cache is disabled to prevent multi-gigabyte `.next` growth, and its
memory graph defaults to 1024 MB. Larger workstations can set
`HARLY_DEV_MEMORY_MB=2048`; values below 512 MB are ignored. `pnpm clean`
removes generated workspace caches without touching PostgreSQL volumes.
