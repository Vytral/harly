# Docker tooling

This directory contains the development database Compose file,
`compose.dev.yml`. It provisions PostgreSQL 16 for the monorepo and is used by
the root `pnpm db:up`, `pnpm db:migrate`, and `pnpm db:down` commands.

Production is a separate, generated Docker Compose deployment. The official
entrypoint is:

```bash
npx @harly/cli
```

The CLI writes a version-pinned Harly image configuration and Compose topology
with PostgreSQL, a one-shot migrator, the app, the scheduler, and optional
Caddy. Do not use `compose.dev.yml` as a production deployment. See
[`docs/self-hosting.md`](../../docs/self-hosting.md) for requirements,
operations, backups, restores, and upgrades.
