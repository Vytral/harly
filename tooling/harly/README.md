<p align="center">
  <img src="https://cdn.molret.dev/banner-harly.webp" alt="Harly — self-hosted applicant tracking system" width="1200" />
</p>

<p align="center">
  The shortest way to install, operate, and upgrade a self-hosted Harly deployment.
</p>

# @harly/cli

Official operations command for Harly self-hosting. It delegates to the
versioned `@harly/create` package:

```bash
npx @harly/cli init harly
cd harly
npx @harly/cli upgrade
npx @harly/cli doctor
```

Upgrades preserve configuration and Docker volumes, create a backup first,
run migrations once, wait for health checks, and pin the pulled image digest.

## Requirements

- Node.js 20.12 or newer
- Docker Engine 24 or newer
- Docker Compose 2.20 or newer
- A Linux VPS with 2 GB RAM plus swap minimum; 4 GB recommended

## Install Harly

```bash
npx @harly/cli init harly
cd harly
npx @harly/cli launch . --yes
```

The wizard configures PostgreSQL, the Harly app, scheduler, persistent uploads,
and optional automatic HTTPS through Caddy.

## Upgrade safely

```bash
cd harly
npx @harly/cli upgrade
```

Use `--to edge` for preview builds or `--to <version>` for a fixed release.
Encrypted backups use `AGE_RECIPIENT`; plaintext backups require the explicit
`--allow-plaintext` flag.

## Commands

```text
harly init [directory]
harly launch [directory] [--yes]
harly doctor [directory] [--json]
harly backup [directory]
harly restore <archive> [directory] --force
harly upgrade [directory] [--to version|edge]
```

Harly is open source under AGPL-3.0. Source, documentation, and issue tracking
live at [github.com/Vytral/harly](https://github.com/Vytral/harly).
