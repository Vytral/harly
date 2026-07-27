<p align="center">
  <img src="https://cdn.molret.dev/banner-harly-preedicion-1.webp" alt="Harly — self-hosted applicant tracking system" width="1200" />
</p>

# @harly/cli

The official operations CLI for self-hosted [Harly](https://github.com/Vytral/harly).
A guided, auditable Node 20.12+ bootstrapper for immutable Docker Compose installs.

```bash
npx @harly/cli           # guided menu
npx @harly/cli check     # verify the host before installing
npx @harly/cli init      # generate a new installation
npx @harly/cli launch    # pull images and start the services
npx @harly/cli doctor    # check services and public readiness
npx @harly/cli update    # back up, upgrade, and migrate
```

Npm's name-similarity protections prevent an unscoped `harly` package. The
scoped package still exposes the `harly` executable for global installs; with
`npx`, use the concise official scope. A normal update is:

```bash
cd harly
npx @harly/cli update
```

Use `--to edge` for preview builds or `--to <release-version>` for a fixed release.
The command creates a private local rollback point first, pulls the target,
pins its immutable digest, runs migrations once, recreates the services, and
waits for readiness. This works without extra system dependencies. Use
`--encrypt` only when you have configured the optional advanced `age` backup
encryption.

## What it does

The interactive wizard runs a host preflight (Docker, ports, DNS, free disk,
firewall) and detects the host's CPU/RAM to recommend a resource profile. It
masks provider secrets and shows the complete installation plan before writing
anything.

When something goes wrong, the CLI doesn't stop at a wall of text:

- A busy port is identified by owner (`nginx.service`, `traefik` container,
  `python3 (PID 1234)`). The wizard offers to stop the service, switch to
  external-proxy mode, or pick a different port — and remembers the choice.
- An unresolvable domain in interactive mode runs a 5-minute wait-and-retry
  loop so DNS propagation can finish on its own.
- A missing Docker, an outdated Compose, an `ufw` rule that blocks 80/443, and
  a `/setup` flow that needs the `HARLY_SETUP_SECRET` all print a one-line
  cause plus the exact command to fix it.

## Commands

| Command | Purpose |
| --- | --- |
| `harly` | Guided menu — install on a fresh host, or manage a detected installation. |
| `harly check [directory]` | Verify the host (Docker, Compose, disk, free memory, firewall) without installing. |
| `harly init [directory] [--force] [--dry-run]` | Generate a new installation. `--dry-run` lists the files that would be written without creating anything. |
| `harly launch [directory] [--yes]` | Pull images and start the services, reporting per-service timing. |
| `harly doctor [directory] [--json] [--fix]` | Check services and public readiness. `--fix` offers to restart the stopped ones. |
| `harly setup-secret [directory]` | Print `HARLY_SETUP_SECRET` from `.env` — no need to open the file. |
| `harly backup [directory] [--encrypt]` | Write a private local rollback archive. |
| `harly restore <archive> [directory] --force` | Restore from an archive. |
| `harly update [directory] [--to version]` | Back up, upgrade, and migrate. |
| `harly uninstall [directory] [--remove-data]` | Stop and remove Harly. |
| `harly deploy <railway\|fly\|digitalocean>` | Generate a managed-cloud config (Railway, Fly.io, DigitalOcean). |

## Resource profiles

The profile is chosen from the host's **free** memory minus Harly's known
reservations (PostgreSQL, scheduler, Caddy, headroom), not from total RAM — a
4 GB VPS that already runs another service is not a "standard" candidate.

| Profile | Free RAM after reservations | Suggested use |
| --- | --- | --- |
| `compact` | < 1.5 GB | Trials and light traffic. |
| `standard` | 1.5 – 3.5 GB | Small-team production. |
| `performance` | 3.5 GB or more | Larger teams. |

## Network requirements

For Caddy/automatic HTTPS, prepare a domain or preferably a subdomain (for
example `careers.example.com`) whose DNS `A` record points to the VPS public
IPv4 address. TCP ports 80 and 443 plus UDP 443 must be free; inbound TCP
80/443 (and UDP 443 for HTTP/3) must be allowed by the VPS firewall. If Nginx,
Apache, Traefik, or another Caddy already owns those ports, select the
external proxy mode and forward the hostname to `127.0.0.1:3000`. The wizard
checks DNS, classifies the process holding a conflicting port, and lets you
fix it in place.

## Automation

For non-interactive use, pass configuration through environment variables. The
required variables are listed by `harly init` when run without them. `launch`
requires `--yes` whenever stdin is not interactive and exits with code `2`
without it.

Secrets are generated independently per install, written only to `.env` with
mode `0600`, and never accepted as CLI arguments or emitted by `doctor --json`.

## License

MIT — see [LICENSE](https://github.com/Vytral/harly/blob/main/LICENSE).
