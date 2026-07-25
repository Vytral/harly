<p align="center">
  <img src="public/banner-harly.webp" alt="Harly, an open-source applicant tracking system" width="1200" />
</p>

<p align="center">
  A self-hosted, open-source, GDPR-ready applicant tracking system for teams that want control over their hiring stack.
</p>

<p align="center">
  <a href="https://github.com/Vytral/harly/actions/workflows/ci.yml"><img src="https://github.com/Vytral/harly/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license" /></a>
  <a href="https://github.com/Vytral/harly"><img src="https://img.shields.io/github/stars/Vytral/harly?style=flat" alt="GitHub stars" /></a>
</p>

<p align="center">
  <a href="https://render.com/deploy?repo=https://github.com/Vytral/harly"><img src="https://img.shields.io/badge/Deploy-Render-46E3B7?logo=render&logoColor=white" alt="Deploy to Render" /></a>
  <a href="https://cloud.digitalocean.com/apps/new?repo=https://github.com/Vytral/harly/tree/main"><img src="https://img.shields.io/badge/Deploy-DigitalOcean-0080FF?logo=digitalocean&logoColor=white" alt="Deploy on DigitalOcean" /></a>
  <a href="#deployment"><img src="https://img.shields.io/badge/Self--host-Docker%20%2F%20Fly%20%2F%20Railway-2496ED?logo=docker&logoColor=white" alt="Self-host with the Harly CLI" /></a>
</p>

> **Public beta.** Harly is usable for small, self-hosted teams, but it is still evolving. Review the [launch checklist](docs/launch-checklist.md), make a backup, and test upgrades in a non-production environment before relying on it for critical hiring.

## What Harly does

Harly is a self-hostable ATS for startups, agencies, and technical teams — recruiting in one place, without a closed SaaS subscription:

- Public job boards, career pages, SEO metadata, and embeddable job widgets
- Jobs, custom application questions, candidate profiles, notes, files, tags, and talent pools
- Kanban and list pipeline views with search, filters, bulk actions, and tasks
- Interviews, offers, notifications, reports, audit logs, consent, and GDPR-ready privacy controls
- Candidate portal with OAuth and profile management
- REST API v1, API keys, OpenAPI output, and outbound webhooks
- Google Calendar, Cal.com, Slack, Outlook, Zoom, email, storage, and AI integrations
- Passkeys, two-factor authentication, RBAC, organizations, and SSO/SAML support

## Why self-host Harly?

- **Own your data.** Run Harly on infrastructure you control, with PostgreSQL and local or S3-compatible storage — no per-seat ATS pricing.
- **Adapt the workflow.** Harly is MIT-licensed open source: inspect it, contribute to it, or modify it for your team.
- **Keep AI optional.** AI features use a workspace-configured provider key encrypted at rest; core recruiting workflows do not require an AI provider.

## GDPR-ready by design

- Candidate data export, authenticated deletion requests, and a reviewed permanent-erasure workflow
- Configurable retention, consent evidence, activity audit trails, and workspace-scoped legal notices
- Human-reviewed AI assistance with minimised audit fingerprints; AI scores are guidance, never the sole basis for a hiring decision

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

## Deployment

Get a running instance in one command — no cloning or building required, it uses the version-pinned GHCR image:

```bash
npx @harly/cli
```

This opens a guided installer that checks the host and creates the PostgreSQL, migrator, app, scheduler, and optional Caddy topology. Run the same command later from the installation directory to manage it. Use `npx @harly/cli doctor` after deployment, and see the self-hosting guide for proxy modes, storage, backups, restore, and upgrades.

Prefer a managed platform? Click **Deploy to Render** or **Deploy on DigitalOcean** above for a one-click deploy straight from this repo ([`render.yaml`](render.yaml) and [`.do/app.yaml`](.do/app.yaml) define exactly what gets provisioned — web, scheduler, migration job, and a managed PostgreSQL database). The same `npx @harly/cli` wizard also deploys to **Railway**, provisioning the project, managed PostgreSQL, both services, and secrets for you through Railway's API, and to **Fly.io** with a versioned [`fly.toml`](fly.toml). Harly does not run on serverless platforms like Vercel: the scheduler needs a persistent background process, which serverless functions can't provide.

Full deployment steps and the environment variable reference live in [`docs/self-hosting.md`](docs/self-hosting.md), [`docs/cloud-deployments.md`](docs/cloud-deployments.md), and [`docs/configuration.md`](docs/configuration.md). For Google Calendar and Google Meet, configure the server-side OAuth client and connect a workspace calendar from Settings using the [Google OAuth setup guide](docs/integrations/google-calendar.md).

### Before inviting your team

1. Use an HTTPS `HARLY_URL` and set independent production secrets.
2. Run `npx @harly/cli doctor` after deployment.
3. Configure off-host encrypted backups and prove a restore once.
4. Create the first owner at `/setup` using `HARLY_SETUP_SECRET` — the CLI writes it to a local `.env`, and Render/DigitalOcean's buttons have you type it in during deploy, so save it then (see [`docs/cloud-deployments.md`](docs/cloud-deployments.md#render) for where to find it per platform). Registration is invite-only after that.

### Career-page discovery

Each workspace publishes a canonical board at `/board/<workspace-slug>`. In the Career Page Builder, **Discovery** controls search indexing, the search title, description, favicon, and share image. Harly exposes `/robots.txt` and `/sitemap.xml`; submit that sitemap to Search Console after setting an HTTPS `HARLY_URL`. Open jobs include `JobPosting` structured data and disappear from the sitemap when closed or moved to trash.

## Quick start for development

The steps above are for running Harly. To work on Harly itself, clone the monorepo and run the dev stack.

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

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and report vulnerabilities privately as described in [SECURITY.md](SECURITY.md) — never in a public issue.

## Roadmap

See the public [Harly roadmap](ROADMAP.md) for current priorities and longer-term direction. It distinguishes features Harly can build directly from integrations that depend on third-party access, credentials, or commercial agreements.

## Project status and support

Harly is maintained by its open-source contributors. The public beta currently targets small, self-hosted teams. We do not offer a hosted service, SLA, or managed recovery; operators remain responsible for their own infrastructure, backups, access controls, and legal obligations.

For feature work and bugs, use GitHub Issues.

## License

Harly is licensed under the [MIT License](LICENSE).

The Harly name and logo are trademarks or brand assets of their respective owner and are not automatically licensed under the MIT License.
