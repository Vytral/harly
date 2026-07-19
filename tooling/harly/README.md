<p align="center">
  <img src="https://cdn.molret.dev/banner-harly.webp" alt="Harly — self-hosted applicant tracking system" width="1200" />
</p>

# @harly/cli

Guided, auditable Node 20.12+ bootstrap CLI for immutable Harly Docker Compose
installs.

The interactive wizard checks Docker, ports, DNS and free disk, detects the
host's CPU/RAM, recommends a resource profile, masks provider secrets and shows
the complete installation plan before writing anything.

Use the official user-facing entrypoint:

```bash
npx @harly/cli
```

Npm's name-similarity protections prevent an unscoped `harly` package. The
scoped package still exposes the `harly` executable for global installs; with
`npx`, use the concise official scope. A normal update is simply:

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

The generated resource profiles are:

- `compact`: 2 GB RAM plus swap, for trials and light traffic.
- `standard`: 4 GB RAM, recommended for small-team production.
- `performance`: 8 GB RAM or more.

For automation, provide configuration through environment variables. `launch`
requires `--yes` whenever stdin is not interactive and exits with code `2`
without it.

Secrets are generated independently, written only to `.env` with mode `0600`,
and never accepted as CLI arguments or emitted by `doctor --json`.
