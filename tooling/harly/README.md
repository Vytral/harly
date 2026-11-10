<p align="center">
  <img src="https://cdn.molret.dev/banner-harly-preedicion-1.webp" alt="Harly — self-hosted applicant tracking system" width="1200" />
</p>

# @harly/cli

Official CLI for self-hosted [Harly](https://github.com/Vytral/harly)
deployments. Install Harly, manage an existing server, or prepare a cloud
deployment from the command line.

Requires Node.js 20.12 or newer. A local installation also requires Docker
Engine 24+ and Docker Compose 2.20+.

## Quick start

Install the CLI once, then run the guided installer on a fresh VPS:

```bash
npm install -g @harly/cli
harly init
```

The installer checks the host, asks for the public URL and storage settings,
generates independent runtime secrets, writes the deployment files, and can
launch the services immediately.

For an existing installation, from its directory:

```bash
harly status
harly doctor
harly backup
harly update
```

Upgrade the CLI itself with `npm install -g @harly/cli@latest`. To try it
without installing, use `npx @harly/cli <command>` instead of
`harly <command>`. Release notes are in [CHANGELOG.md](CHANGELOG.md).

## Installation lifecycle

The local deployment lifecycle is intentionally explicit:

```text
check → init → launch → doctor → backup/update → uninstall
```

`init` generates configuration. It does not pull images or start containers
unless `--launch` is supplied. `launch` waits for PostgreSQL, migrations, the
web service, the scheduler, and Caddy when enabled. With automatic HTTPS,
`Harly is ready` also requires the public readiness endpoint to succeed.

## Commands

| Command | Purpose |
| --- | --- |
| `harly` | Open the guided menu or manage an installation found in the current path. |
| `harly check [directory]` | Check Docker, Compose, disk, memory, firewall, and required public ports. |
| `harly init [directory]` | Generate a new installation. Use `--launch` to start it in the same run. |
| `harly launch [directory]` | Pull images, start services, and wait for readiness. |
| `harly resume [directory]` | Retry startup with saved configuration and secrets. |
| `harly status [directory]` | One-screen overview: URL, version vs latest, containers, database, disk, last backup, certificate. |
| `harly doctor [directory]` | Check service health and public readiness. |
| `harly setup-secret [directory]` | Read the setup secret from the local `.env` file. |
| `harly backup [directory]` | Create a private rollback archive. |
| `harly restore <archive> [directory]` | Restore database and uploads after explicit confirmation. |
| `harly update [directory]` | Find this install and update it to the current stable release. |
| `harly uninstall [directory]` | Stop and remove Harly; data is kept unless `--remove-data` is used. |
| `harly deploy railway` | Provision and deploy the Railway project. |
| `harly deploy fly prepare` | Generate a Fly.io deployment configuration. |
| `harly deploy digitalocean prepare` | Generate a DigitalOcean App Platform specification. |
| `harly install-global` | Install this CLI globally with npm so you can type `harly` instead of `npx @harly/cli`. |

Run `harly --help` for the commands grouped by purpose, and
`harly help <command>` (or `harly <command> --help`) for one command's options
and examples. A mistyped command or option suggests the closest match, for
example `harly docter` answers `Did you mean harly doctor?`.

### `harly status`

```text
INSTANCE
✓ URL      https://ats.example.com  answers ready · 120 ms
✓ Version  v0.2.4  latest
SERVICES
✓ Database     running · healthy
✓ Application  running · healthy
HOST
✓ Disk         23.4 GB free
✓ Last backup  2 days ago · 12 MB
✓ Certificate  Let's Encrypt · expires in 61 days
```

Only what the CLI can verify is shown: container state comes from
`docker compose ps`, readiness from the public `/api/health/ready` endpoint,
the latest release from the release manifest (marked "latest unknown" offline),
the last backup from `backups/`, and the certificate from a TLS handshake with
the public host. Warnings (a backup older than a week, low disk, a certificate
expiring within 14 days, a newer release) do not change the exit code; a stopped
service or failing readiness exits `1`. `--json` prints the same data as one
document.

### Installing the CLI globally

When you run the CLI through npx in a terminal, it asks once:
`Install Harly globally so you can just type harly?` (default yes). It then
installs the same version with npm, checks that `harly` resolves, and, if npm's
global bin directory is not on `PATH`, prints the exact command for your shell
(zsh, bash, fish, or PowerShell). The question is skipped when the CLI is
already installed globally, is never accepted automatically by `--yes`, and is
never asked in CI, pipes, or `--json`. Declining is remembered in
`config.json` under `$XDG_CONFIG_HOME/harly` (default `~/.config/harly`; on
Windows `%APPDATA%\harly`; override with `HARLY_CONFIG_DIR`). An npm permissions
error keeps the deployment running; you can keep using npx.

To do it explicitly, at any time:

```bash
harly install-global          # asks first in a terminal
harly install-global --yes    # for scripts; --dry-run previews
```

### Update notices

In a terminal, the header notes when a newer CLI is published (checked at most
once a day against the npm registry, with a short timeout). Set
`HARLY_NO_UPDATE_CHECK=1` to turn it off. It never runs in CI, with `--json`, or
with `--quiet`.

Run management commands from the installation directory. `harly update` updates
the application; update the global CLI separately with:

```bash
npm install -g @harly/cli@latest
```

If installation fails after configuration was saved, fix the reported problem
and retry without repeating the setup questions:

```bash
harly resume ./harly --yes
```

Without a path, `resume` checks the installation containing the current
directory, then the exact `./harly` default. The guided menu recognizes that
default directory too. Saved files and secrets are reused; Docker reuses cached
images and reconciles the existing containers. `--dry-run` previews the target.

Caddy is checked after the app and scheduler. It must be running and the public
`/api/health/ready` endpoint must respond successfully, including valid TLS for
HTTPS. The default wait is 900 seconds for Caddy and 90 seconds for each other
service. `launch` and `resume` accept `--timeout <seconds>` to override each wait.
During the wait, the CLI reports elapsed time and the latest connection or HTTP
status. If it times out, it includes the command to inspect Caddy's logs.

## Local installer

Interactive installation:

```bash
harly init ./harly
```

Fully automated local installation:

```bash
HARLY_INITIAL_ADMIN_EMAIL=owner@example.com \
STORAGE_PROVIDER=local \
harly init ./harly \
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
| `--image <tag-or-digest>` | Pin `ghcr.io/vytral/harly:0.2.0`, `:latest`, or a digest. `:latest` is recorded as the current stable digest. `edge` is rejected. |
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
harly init ./harly --url https://careers.example.com --non-interactive
```

The generated `.env` is owner-readable only (`0600`). Do not commit it.

## Managed cloud deployment

Railway is provisioned directly through its API:

```bash
RAILWAY_TOKEN=... \
S3_BUCKET=harly-production \
S3_ACCESS_KEY_ID=... \
S3_SECRET_ACCESS_KEY=... \
harly deploy railway \
  --project-name harly-production \
  --email owner@example.com \
  --non-interactive
```

The command creates PostgreSQL, the web and scheduler services, a migration
service, environment variables, a public Railway domain, and deployments. It
waits for public readiness before returning `ready`.

Railway also supports repository-native Config as Code. The root
[`railway.toml`](../../railway.toml) is automatically read for the web service:
it selects the Dockerfile, web start command, readiness endpoint, and restart
policy. Railway applies this file to one service deployment; it does not
provision PostgreSQL, the scheduler, or the migration service. Use the CLI
above for the complete Railway topology. Railway Templates can eventually
package that topology as a one-click multi-service install.

Fly.io and DigitalOcean currently use a safe preparation flow:

```bash
harly deploy fly prepare --url https://careers.example.com
harly deploy digitalocean prepare --url https://careers.example.com
```

These commands finish with `ready-to-deploy`, generate provider files, and
print the exact remaining commands. They do not create provider resources.

Railway secrets are not written to a local file by default. Opt in explicitly:

```bash
harly deploy railway --save-env
```

The file is written with mode `0600` and a warning is shown. Secrets are never
accepted as ordinary CLI arguments. Use environment variables or one explicit
stdin source, such as `--railway-token-stdin` or `--s3-secret-stdin`.

## Automation and JSON output

Global flags work before or after the subcommand when unambiguous:

```text
--json --quiet --no-color --verbose --non-interactive --yes --dry-run --force --timeout <seconds>
```

`--quiet` hides the header, hints, and update notices but keeps results and
errors. `--no-color` (or `NO_COLOR`) removes colour. Without a terminal, in CI,
or with `--non-interactive`, `harly` with no arguments checks the installation
found in the current path (or prints the command list) instead of opening the
menu.

`--json` disables prompts and loaders. stdout contains exactly one JSON
document for success, failure, and cancellation; human diagnostics go to
stderr. Results are versioned with `schemaVersion: 1`.

Example:

```bash
harly --json init ./harly \
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

The **Publish CLI** GitHub workflow publishes `@harly/cli` to npm through
Trusted Publishing, after each stable Harly release or when run by hand. Bump
`version` in `package.json` and add a matching `CHANGELOG.md` section; the
workflow skips a version that is already on npm. `pnpm pack:check` previews
the tarball locally. See `docs/operations/release-policy.md`.

## License

MIT — see [LICENSE](https://github.com/Vytral/harly/blob/main/LICENSE).

## Anonymous telemetry (opt-in)

`harly init` asks once, in a terminal, whether to share anonymous install statistics. The default answer is **no**. Nothing is sent in non-interactive runs unless you pass `--telemetry` or set `HARLY_TELEMETRY=1`.

- Turn it off: `harly telemetry disable`, `--no-telemetry`, `HARLY_TELEMETRY=0` or `DO_NOT_TRACK=1`. These always win over a saved "yes".
- Inspect: `harly telemetry status`. Enable later: `harly telemetry enable`.
- The choice and the random instance id are stored in the CLI preferences file (`config.json` in the Harly config directory).
- One `POST` is sent after a successful install, with a 2 second timeout. Failures are ignored and never affect the install.
- Endpoint: `HARLY_TELEMETRY_URL`, default `https://telemetry.harly.dev/v1/events`. That default is a **placeholder**; the project owner must point it at a real collector.

Never sent: domain, email, company name, hostname, IP-derived data or secrets.

### Collector contract

`POST <endpoint>` with `content-type: application/json`. Respond `2xx` (the body is ignored). Source IPs should not be logged or stored by the collector.

```json
{
  "schema": 1,
  "event": "install_completed",
  "instanceId": "3f1c9a52-8d0e-4b7a-9c1d-2a6e5b8f0d41",
  "cliVersion": "0.6.0",
  "os": "linux",
  "arch": "x64",
  "deployMode": "caddy",
  "referral": "github"
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `schema` | number | Always `1` for this shape. |
| `event` | string | `install_completed`. |
| `instanceId` | uuid v4 | Random, generated locally. Not derived from host, IP or domain. |
| `cliVersion` | string | Semver of the CLI. |
| `os`, `arch` | string | Node `os.platform()` and `os.arch()`. |
| `deployMode` | string, optional | Proxy mode, for example `caddy`, `external`, `local`. |
| `referral` | string, optional | One of `github`, `search`, `friend`, `social`, `blog_video`, `other`. Omitted when the user skips. |
