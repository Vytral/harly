<p align="center">
  <img src="public/banner-harly.webp" alt="Harly, an open-source applicant tracking system" width="1200" />
</p>

<p align="center">
  A self-hosted, open-source, GDPR-ready applicant tracking system for teams that want control over their hiring stack.
</p>

<p align="center">
  <a href="https://github.com/Vytral/harly/actions/workflows/ci.yml"><img src="https://github.com/Vytral/harly/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="AGPL-3.0 license" /></a>
  <a href="https://github.com/Vytral/harly"><img src="https://img.shields.io/github/stars/Vytral/harly?style=flat" alt="GitHub stars" /></a>
</p>

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https://github.com/Vytral/harly"><img src="https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white" alt="Deploy to Vercel" /></a>
  <a href="docs/cloud-deployments.md#railway"><img src="https://img.shields.io/badge/Deploy-Railway-0B0D0E?logo=railway&logoColor=white" alt="Deploy on Railway" /></a>
  <a href="docs/cloud-deployments.md#flyio"><img src="https://img.shields.io/badge/Deploy-Fly.io-7B3FE4?logo=flydotio&logoColor=white" alt="Deploy on Fly.io" /></a>
  <a href="docs/cloud-deployments.md#digitalocean-app-platform"><img src="https://img.shields.io/badge/Deploy-DigitalOcean-0080FF?logo=digitalocean&logoColor=white" alt="Deploy on DigitalOcean" /></a>
  <a href="#docker--self-hosting"><img src="https://img.shields.io/badge/Self--host-Docker-2496ED?logo=docker&logoColor=white" alt="Self-host with Docker" /></a>
</p>

> **Public beta.** Harly is usable for small, self-hosted teams, but it is still evolving. Review the [launch checklist](docs/launch-checklist.md), make a backup, and test upgrades in a non-production environment before relying on it for critical hiring.

## What Harly does

Harly is a self-hostable ATS for startups, agencies, and technical teams. It brings the recruiting workflow into one place without requiring a closed SaaS subscription:

- Public job boards, career pages, SEO metadata, and embeddable job widgets
- Jobs, custom application questions, candidate profiles, notes, files, tags, and talent pools
- Kanban and list pipeline views with search, filters, bulk actions, and tasks
- Interviews, offers, notifications, reports, audit logs, consent, and GDPR-ready privacy controls
- Candidate portal with OAuth and profile management
- REST API v1, API keys, OpenAPI output, and outbound webhooks
- Google Calendar, Cal.com, Slack, Outlook, Zoom, email, storage, and AI integrations
- Passkeys, two-factor authentication, RBAC, organizations, and SSO/SAML support

## Why self-host Harly?

- **Own your candidate data.** Run Harly in infrastructure you control, with PostgreSQL and local or S3-compatible storage.
- **Avoid per-seat ATS pricing.** Start with a small Docker deployment and grow when your hiring operation does.
- **Adapt the workflow.** Harly is AGPL-3.0-only open source: inspect it, contribute to it, or modify it for your team.
- **Keep AI optional.** AI features use a workspace-configured provider key encrypted at rest; core recruiting workflows do not require an AI provider.

## GDPR-ready by design

Harly gives European hiring teams the privacy controls they need to build
responsible recruiting workflows:

- Candidate data export, authenticated deletion requests, and a reviewed permanent-erasure workflow
- Configurable retention, consent evidence, activity audit trails, and workspace-scoped legal notices
- Human-reviewed AI assistance with minimised audit fingerprints; AI scores are guidance, never the sole basis for a hiring decision
- Self-hosting with infrastructure and storage choices under your control

Harly provides compliance tooling, not legal advice. Each organisation remains
responsible for its lawful basis, notices, processor contracts, international
transfers, production configuration, and legal obligations. See the
[privacy and AI operations guide](docs/compliance-operations.md) for the
operator checklist.

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

- Node.js 22 or newer
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

The deployment-specific steps and environment variable reference live in [`docs/self-hosting.md`](docs/self-hosting.md), [`docs/cloud-deployments.md`](docs/cloud-deployments.md), and [`docs/configuration.md`](docs/configuration.md).

### Vercel

Use the button above to clone the repository into a Vercel project. Add a managed PostgreSQL database and configure the required environment variables before the first deploy. Run `pnpm db:migrate` from CI or a trusted migration job; do not run schema migrations from every serverless instance.

### Railway

Run `npx @harly/cli` and choose **Deploy on Railway**. Harly uses its
version-pinned GHCR image, Railway managed PostgreSQL, a dedicated scheduler,
and S3-compatible uploads; it does not require cloning or building this repo.

### DigitalOcean App Platform

Run `npx @harly/cli` and choose **Deploy on DigitalOcean** after creating a
DigitalOcean Managed PostgreSQL database. The wizard emits a private App Spec
with its encrypted `DATABASE_URL`, S3-compatible uploads, web, scheduler, and
migrations from the same pinned GHCR image. A manual
[`app.template.yaml`](deploy/digitalocean/app.template.yaml) is also available.

### Docker / self-hosting

Install without cloning the repository:

```bash
npx @harly/cli
```

This opens a guided installer that creates the PostgreSQL, migrator, app,
scheduler, and optional Caddy topology with a version-pinned image. Run the
same command later from the installation directory to manage it. See the
self-hosting guide for secure first-owner setup, proxy modes, storage, backups,
restore, upgrades, Railway, and Fly.io.

### Before inviting your team

1. Use an HTTPS `HARLY_URL` and set independent production secrets.
2. Run `npx @harly/cli doctor` after deployment.
3. Configure off-host encrypted backups and prove a restore once.
4. Create the first owner at `/setup`, then keep registration invite-only.
5. Read the [production launch checklist](docs/launch-checklist.md).

### Career-page discovery

Each workspace publishes a canonical board at `/board/<workspace-slug>`. In the
Career Page Builder, **Discovery** controls search indexing, the search title,
description, favicon, and share image. Harly exposes `/robots.txt` and
`/sitemap.xml`; submit that sitemap to Search Console after setting an HTTPS
`HARLY_URL`. Open jobs include `JobPosting` structured data and disappear from
the sitemap when closed or moved to trash.

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

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Roadmap

See the public [Harly roadmap](ROADMAP.md) for current priorities and longer-term
direction. It distinguishes features Harly can build directly from integrations
that depend on third-party access, credentials, or commercial agreements.

## Project status and support

Harly is maintained by its open-source contributors. The public beta currently targets small, self-hosted teams. We do not offer a hosted service, SLA, or managed recovery; operators remain responsible for their own infrastructure, backups, access controls, and legal obligations.

For feature work and bugs, use GitHub Issues. For vulnerabilities, never open a public issue — follow [SECURITY.md](SECURITY.md).

## License

Harly is licensed under the [GNU Affero General Public License v3.0 only](LICENSE). If you run a modified Harly instance over a network, AGPLv3 requires you to offer users access to the corresponding source of that modified version. This repository's current notice uses `Harly contributors`; confirm the legal copyright holder and update the notice before a formal release.

The Harly name and logo are trademarks or brand assets of their respective owner and are not automatically licensed under AGPLv3.
