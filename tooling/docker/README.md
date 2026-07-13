# Docker Tooling

The root `docker-compose.yml` currently provisions PostgreSQL 16 for local development. The Harly web process runs with Node.js after the workspace build; there is not yet a maintained production application image in this directory.

See [`docs/self-hosting.md`](../../docs/self-hosting.md) for the supported Docker/PostgreSQL, Vercel, and Railway deployment paths.

Planned additions:

- Production application image
- Compose overlays for S3-compatible storage and backups
- Health checks and upgrade helpers
