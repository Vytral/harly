<p align="center">
  <img src="https://cdn.molret.dev/banner-harly-preedicion-1.webp" alt="Harly — self-hosted applicant tracking system" width="1200" />
</p>

# @harly/cli

The official installer and operations CLI for self-hosted [Harly](https://github.com/Vytral/harly).
It creates and manages an immutable Docker Compose deployment with PostgreSQL,
the Harly web app, the scheduler, and an optional Caddy HTTPS proxy.

Requires Node.js 20.12 or newer. A local installation also requires Docker
Engine 24+ and Docker Compose 2.20+.

## Quick start

Run the guided installer on a fresh VPS:

```bash
npx --yes @harly/cli
```

The installer checks the host, asks for the public URL and storage settings,
generates independent runtime secrets, writes the deployment files, and can
launch the services immediately.

For an existing installation:

```bash
npx @harly/cli doctor
npx @harly/cli backup
npx @harly/cli update
```

## Installation lifecycle

The local deployment lifecycle is intentionally explicit:

```text
check → init → launch → doctor → backup/update → uninstall
```

`init` generates configuration. It does not pull images or start containers
unless `--launch` is supplied. `launch` waits for PostgreSQL, migrations, the
web service, the scheduler, and Caddy when enabled. The command reports
`Harly is ready` only after the public readiness endpoint succeeds.

## Commands

| Command | Purpose |
| --- | --- |
| `harly` | Open the guided menu or manage an installation found in the current path. |
| `harly check [directory]` | Check Docker, Compose, disk, memory, firewall, and required public ports. |
| `harly init [directory]` | Generate a new installation. Use `--launch` to start it in the same run. |
| `harly launch [directory]` | Pull images, start services, and wait for readiness. |
| `harly doctor [directory]` | Check service health and public readiness. |
| `harly setup-secret [directory]` | Read the setup secret from the local `.env` file. |
| `harly backup [directory]` | Create a private rollback archive. |
| `harly restore <archive> [directory]` | Restore database and uploads after explicit confirmation. |
| `harly update [directory]` | Back up, pull a pinned image, migrate, and restart safely. |
| `harly uninstall [directory]` | Stop and remove Harly; data is kept unless `--remove-data` is used. |
| `harly deploy railway` | Provision and deploy the Railway project. |
| `harly deploy fly prepare` | Generate a Fly.io deployment configuration. |
| `harly deploy digitalocean prepare` | Generate a DigitalOcean App Platform specification. |

Run `npx @harly/cli --help` for the compact command list.

## Local installer

Interactive installation:

```bash
npx @harly/cli init ./harly
```

Fully automated local installation:

```bash
HARLY_INITIAL_ADMIN_EMAIL=owner@example.com \
STORAGE_PROVIDER=local \
npx --yes @harly/cli init ./harly \
  --url https://careers.example.com \
  --proxy caddy \
  --resource-profile standard \
  --launch \
  --non-interactive
```

Important `init` flags:

| Flag | Description |
| --- | --- |
| `--url <origin>` | Complete HTTP(S) origin, for example `https://careers.example.com`. |
| `--domain <hostname>` | Convenience form normalized to an HTTPS origin. |
| `--proxy <caddy\|external\|local>` | Select HTTPS, an external proxy, or local development mode. |
| `--port <number>` | Host port for `external` and `local` modes. |
| `--email <address>` | Initial owner email. |
| `--organization <name>` | Organization display name. |
| `--storage <local\|s3>` | Choose local persistent storage or S3-compatible storage. |
| `--resource-profile <profile>` | Select `compact`, `standard`, or `performance`. |
| `--image <tag-or-digest>` | Override the pinned release image. `latest` is rejected. |
| `--launch` | Launch after generating configuration. |
| `--no-launch` | Generate only, even in an interactive session. |
| `--output-dir <directory>` | Alias for the positional directory. Conflicting paths are rejected. |
| `--dry-run` | Resolve and display the plan without writing files or pulling images. |
| `--force` | Replace generated non-secret files; it never bypasses safety checks or overwrites `.env` automatically. |

For S3, keep credentials in the environment:

```bash
STORAGE_PROVIDER=s3 \
S3_BUCKET=harly-production \
S3_REGION=auto \
S3_ACCESS_KEY_ID=... \
S3_SECRET_ACCESS_KEY=... \
npx @harly/cli init ./harly --url https://careers.example.com --non-interactive
```

The generated `.env` is owner-readable only (`0600`). Do not commit it.

## Managed cloud deployment

Railway is provisioned directly through its API:

```bash
RAILWAY_TOKEN=... \
S3_BUCKET=harly-production \
S3_ACCESS_KEY_ID=... \
S3_SECRET_ACCESS_KEY=... \
npx --yes @harly/cli deploy railway \
  --project-name harly-production \
  --email owner@example.com \
  --non-interactive
```

The command creates PostgreSQL, the web and scheduler services, a migration
service, environment variables, a public Railway domain, and deployments. It
waits for public readiness before returning `ready`.

Fly.io and DigitalOcean currently use a safe preparation flow:

```bash
npx @harly/cli deploy fly prepare --url https://careers.example.com
npx @harly/cli deploy digitalocean prepare --url https://careers.example.com
```

These commands finish with `ready-to-deploy`, generate provider files, and
print the exact remaining commands. They do not create provider resources.

Railway secrets are not written to a local file by default. Opt in explicitly:

```bash
npx @harly/cli deploy railway --save-env
```

The file is written with mode `0600` and a warning is shown. Secrets are never
accepted as ordinary CLI arguments. Use environment variables or one explicit
stdin source, such as `--railway-token-stdin` or `--s3-secret-stdin`.

## Automation and JSON output

Global flags work before or after the subcommand when unambiguous:

```text
--json --verbose --non-interactive --yes --dry-run --force --timeout <seconds>
```

`--json` disables prompts and loaders. stdout contains exactly one JSON
document for success, failure, and cancellation; human diagnostics go to
stderr. Results are versioned with `schemaVersion: 1`.

Example:

```bash
npx @harly/cli --json init ./harly \
  --dry-run \
  --url http://127.0.0.1:3000 \
  --proxy local \
  --email owner@example.com
```

Possible statuses include `dry-run`, `generated`, `ready-to-deploy`, `ready`,
`failed`, and `cancelled`. Stable error codes include `INVALID_ARGUMENT`,
`MISSING_SECRET`, `READINESS_TIMEOUT`, and `PARTIAL_PROVISIONING`.

Exit codes are:

| Code | Meaning |
| --- | --- |
| `0` | Completed successfully. |
| `1` | Operational failure. |
| `2` | Invalid usage or configuration. |
| `130` | Cancelled with Ctrl+C. |

`--dry-run --json` lists resolved configuration, artifacts, and planned remote
operations without writing files, downloading images, or creating resources.

## Resource profiles and proxy modes

Profiles are selected from free memory after Harly's reservations:

| Profile | Suggested use |
| --- | --- |
| `compact` | Trials and hosts with less than 1.5 GB available headroom. |
| `standard` | Small-team production with 1.5–3.5 GB available headroom. |
| `performance` | Larger teams with more than 3.5 GB available headroom. |

| Proxy mode | Use when |
| --- | --- |
| `caddy` | Harly owns HTTPS and ports 80/443. |
| `external` | Nginx, Traefik, or another proxy terminates TLS. |
| `local` | Development or private HTTP testing. |

For Caddy, point an A/AAAA record at the VPS and allow TCP 80/443 plus UDP
443. The installer checks DNS and reports the process or container holding a
conflicting port.

## Publishing the package

From this package directory:

```bash
pnpm pack:check
npm whoami
npm publish --access public
```

The package is scoped as `@harly/cli` and exposes the `harly` executable. The
first public scoped publish requires `--access public` and npm account
authentication with 2FA or an appropriately scoped granular token.

## License

MIT — see [LICENSE](https://github.com/Vytral/harly/blob/main/LICENSE).
