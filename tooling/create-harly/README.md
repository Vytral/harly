# @harly/create

Auditable Node 20+ bootstrap CLI for immutable Harly Docker Compose installs.

```bash
npx @harly/create init harly
cd harly
npx @harly/create launch . --yes
npx @harly/create doctor .
```

Secrets are generated independently, written only to `.env` with mode `0600`,
and never accepted as CLI arguments or emitted by `doctor --json`.
