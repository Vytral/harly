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

The generated resource profiles are:

- `compact`: 2 GB RAM plus swap, for trials and light traffic.
- `standard`: 4 GB RAM, recommended for small-team production.
- `performance`: 8 GB RAM or more.

For automation, provide configuration through environment variables. `launch`
requires `--yes` whenever stdin is not interactive and exits with code `2`
without it.

Secrets are generated independently, written only to `.env` with mode `0600`,
and never accepted as CLI arguments or emitted by `doctor --json`.
