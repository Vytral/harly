# Harly

<p align="center">
  <img src="public/harly-logo.png" alt="Harly" width="620" />
</p>

<p align="center">
  Open-source applicant tracking for teams that want control over their hiring stack.
</p>

<p align="center">
  <a href="https://github.com/Vytral/harly/actions/workflows/ci.yml"><img src="https://github.com/Vytral/harly/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="AGPL-3.0 license" /></a>
  <a href="https://github.com/Vytral/harly"><img src="https://img.shields.io/github/stars/Vytral/harly?style=flat" alt="GitHub stars" /></a>
</p>

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https://github.com/Vytral/harly"><strong>Deploy to Vercel</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="https://railway.com/new"><strong>Deploy on Railway</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="#docker--self-hosting"><strong>Self-host with Docker/Postgres</strong></a>
</p>

> Harly is early-stage software. Expect active development, incomplete areas, and breaking changes while the foundation settles.

## What Harly does

Harly is a self-hostable ATS for startups, agencies, and technical teams. It brings the recruiting workflow into one place without requiring a closed SaaS subscription:

- Public job boards, career pages, SEO metadata, and embeddable job widgets
- Jobs, custom application questions, candidate profiles, notes, files, tags, and talent pools
- Kanban and list pipeline views with search, filters, bulk actions, and tasks
- Interviews, offers, notifications, reports, audit logs, consent, and GDPR-oriented controls
- Candidate portal with OAuth and profile management
- REST API v1, API keys, OpenAPI output, and outbound webhooks
- Google Calendar, Cal.com, Slack, Outlook, Zoom, email, storage, and AI integrations
- Passkeys, two-factor authentication, RBAC, organizations, and SSO/SAML support

## Stack

- Next.js App Router and React
- TypeScript, Server Actions, and Turborepo
- Drizzle ORM and PostgreSQL 16
- Better Auth
- Tailwind CSS, shadcn/ui, and Radix UI
- Resend and React Email
- Local or S3-compatible storage (AWS S3, Cloudflare R2, or MinIO)
- Vercel AI SDK with configurable model providers

## Quick start

### Requirements

- Node.js 20 or newer
- pnpm 9 (`corepack enable`)
- Docker Desktop or another Docker-compatible runtime

### Run locally

```bash
git clone https://github.com/Vytral/harly.git
cd harly
cp .env.example .env.local
pnpm install
pnpm dev
```

`pnpm dev` starts PostgreSQL, applies Drizzle migrations, and starts the web app at `http://localhost:3000`. If you already have PostgreSQL running, set `DATABASE_URL` in `.env.local` and use `pnpm dev:web` instead.

Useful commands:

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm db:studio
pnpm db:down
pnpm lint
pnpm typecheck
pnpm test
```

## Deployment

The deployment-specific steps and environment variable reference live in [`docs/self-hosting.md`](docs/self-hosting.md) and [`docs/configuration.md`](docs/configuration.md).

### Vercel

Use the button above to clone the repository into a Vercel project. Add a managed PostgreSQL database and configure the required environment variables before the first deploy. Run `pnpm db:migrate` from CI or a trusted migration job; do not run schema migrations from every serverless instance.

### Railway

Create a project from the repository using the Railway button above, add a PostgreSQL service, reference its `DATABASE_URL`, and set `pnpm db:migrate` as the pre-deploy command. Use `pnpm build` as the build command and `pnpm --filter web start` as the start command.

### Docker / self-hosting

The repository includes Docker Compose for PostgreSQL. The web app can run as a standard Node.js process after `pnpm build`; see the self-hosting guide for the production sequence, storage requirements, reverse proxy notes, backups, and cron setup.

## Repository layout

```txt
apps/web          Core Harly ATS application
apps/docs         Public documentation app (planned)
apps/marketing    Marketing site (planned)
packages/db       Drizzle schema, migrations, and database client
packages/auth     Better Auth integration
packages/api      REST API contracts, keys, and webhooks
packages/storage  Local and S3-compatible storage adapters
packages/emails   React Email templates and sender
tooling/          CLI, Docker, and maintenance helpers
docs/             Operator and contributor documentation
```

## Contributing

Issues and pull requests are welcome. Before opening a large change, check the existing issue tracker and describe the user-facing problem, the proposed behavior, and how it was tested. Keep secrets, production data, and uploaded files out of commits.

## License

Harly is licensed under the [GNU Affero General Public License v3.0 only](LICENSE). If you run a modified Harly instance over a network, AGPLv3 requires you to offer users access to the corresponding source of that modified version. This repository's current notice uses `Harly contributors`; confirm the legal copyright holder and update the notice before a formal release.

The Harly name and logo are trademarks or brand assets of their respective owner and are not automatically licensed under AGPLv3.
