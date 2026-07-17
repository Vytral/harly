<p align="center">
  <img src="https://cdn.molret.dev/banner-harly.webp" alt="Harly — self-hosted applicant tracking system" width="1200" />
</p>

# @harly/create

Guided, auditable Node 20.12+ bootstrap CLI for immutable Harly Docker Compose
installs.

The interactive wizard checks Docker, ports, DNS and free disk, detects the
host's CPU/RAM, recommends a resource profile, masks provider secrets and shows
the complete installation plan before writing anything.

```bash
npx @harly/create init harly
cd harly
npx @harly/create launch . --yes
npx @harly/create doctor .
```

After the short-name package is published, the same CLI is available as
`npx harly`. A normal update is simply:

```bash
cd harly
npx harly upgrade
```

Use `--to edge` for preview builds or `--to 0.1.0-beta.2` for a fixed release.
The command backs up first, pulls the target, pins its immutable digest, runs
migrations once, recreates the services, and waits for readiness. Configure
`AGE_RECIPIENT` for encrypted backups, or explicitly pass `--allow-plaintext`.

The generated resource profiles are:

- `compact`: 2 GB RAM plus swap, for trials and light traffic.
- `standard`: 4 GB RAM, recommended for small-team production.
- `performance`: 8 GB RAM or more.

For automation, provide configuration through environment variables. `launch`
requires `--yes` whenever stdin is not interactive and exits with code `2`
without it.

Secrets are generated independently, written only to `.env` with mode `0600`,
and never accepted as CLI arguments or emitted by `doctor --json`.
