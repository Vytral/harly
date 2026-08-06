<p align="center">
  <img src="public/banner-harly.webp" alt="Harly, an open-source applicant tracking system" width="1200" />
</p>

<p align="center">
  A self-hosted, open-source applicant tracking system for teams that want control over their hiring stack.
</p>

<p align="center">
  <a href="https://github.com/Vytral/harly/actions/workflows/ci.yml"><img src="https://github.com/Vytral/harly/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@harly/cli"><img src="https://img.shields.io/npm/v/@harly/cli?label=%40harly%2Fcli" alt="npm version for @harly/cli" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license" /></a>
  <a href="https://github.com/Vytral/harly"><img src="https://img.shields.io/github/stars/Vytral/harly?style=flat" alt="GitHub stars" /></a>
</p>

<p align="center">
  <a href="https://docs.harly.dev">Documentation</a> ·
  <a href="https://docs.harly.dev/quickstart">Quickstart</a> ·
  <a href="https://docs.harly.dev/self-hosting/overview">Self-hosting</a> ·
  <a href="https://docs.harly.dev/developers/api-reference">API reference</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="SECURITY.md">Security</a>
</p>

<p align="center">
  <a href="https://render.com/deploy?repo=https://github.com/Vytral/harly"><img src="https://img.shields.io/badge/Deploy-Render-46E3B7?logo=render&logoColor=white" alt="Deploy to Render" /></a>
  <a href="https://cloud.digitalocean.com/apps/new?repo=https://github.com/Vytral/harly/tree/main"><img src="https://img.shields.io/badge/Deploy-DigitalOcean-0080FF?logo=digitalocean&logoColor=white" alt="Deploy on DigitalOcean" /></a>
  <a href="#deployment"><img src="https://img.shields.io/badge/Self--host-Docker%20%2F%20Fly%20%2F%20Railway-2496ED?logo=docker&logoColor=white" alt="Self-host with the Harly CLI" /></a>
</p>

> **Public beta.** Harly is intended for small, self-hosted teams while the
> product and deployment workflows continue to mature. Review the [production
> launch checklist](docs/launch-checklist.md), test upgrades on a disposable
> installation, and verify backups before importing real candidate data.

## What is Harly?

Harly is a self-hostable ATS for startups, agencies, and technical teams. It
keeps recruiting workflows, candidate data, documents, integrations, and
automation in one place, without a closed SaaS subscription.

## Product capabilities

| Area | Included capabilities |
| --- | --- |
| Recruiting | Jobs, application questions, candidate pipelines, interviews, offers, tasks, scorecards, talent pools, search, and reports |
| Candidate experience | Public jobs, career pages, embeddable widgets, candidate portal, SEO metadata, and structured job data |
| Communication | Inbox, email, templates, calendars, video interviews, and team notifications |
| Integrations and automation | ATS imports, storage, signatures, REST API, webhooks, automations, and realtime events |
| AI assistance | Candidate matching, contextual chat, anonymization, generation, and drafting; optional and human-reviewed |
| Security and privacy | RBAC, MFA, passkeys, SSO, SCIM, API-key scopes, audit logs, consent, retention, export, and deletion workflows |

See the [product documentation](https://docs.harly.dev) for the complete
feature guide and integration-specific requirements. Provider credentials,
permissions, and commercial access are separate from product capability.

## Why self-host Harly?

- **Own your data.** Run Harly on infrastructure you control with PostgreSQL
  and local or S3-compatible storage.
- **Adapt the workflow.** Harly is MIT-licensed open source: inspect it,
  contribute to it, or customize it for your team.
- **Keep AI optional.** Core recruiting workflows do not require an AI provider;
  workspace AI keys are encrypted at rest when AI is enabled.
- **Operate transparently.** The repository includes the application, CLI,
  deployment assets, migrations, API contracts, and operational documentation.

## Privacy and compliance tooling

Harly includes tooling for candidate export, authenticated deletion requests,
permanent-erasure review, configurable retention, consent evidence, audit
trails, workspace-scoped legal notices, and human-reviewed AI assistance.

Harly provides compliance tooling, not legal advice. Each organization remains
responsible for its lawful basis, notices, processor contracts, international
transfers, retention decisions, production configuration, and legal obligations.
Read the [privacy documentation](https://docs.harly.dev/security/privacy) and
[privacy and AI operations guide](docs/compliance-operations.md) before using
Harly with real candidate data.

## Deployment

### Self-host with the Harly CLI

The Harly CLI uses a version-pinned GHCR image; your VPS does not need to
compile Next.js or install the monorepo. On a fresh Linux host with Docker:

```bash
npx -y @harly/cli
```

The guided installer checks the host, creates PostgreSQL, the migrator, web
app, scheduler, and optional Caddy topology, generates independent secrets,
runs migrations, and waits for public readiness. From the installation
directory, the same CLI manages health checks, backups, restores, upgrades, and
uninstallation:

```bash
npx @harly/cli doctor
npx @harly/cli backup
npx @harly/cli update --to <release-version> --yes
```

Read the [self-hosting guide](https://docs.harly.dev/self-hosting/overview),
[CLI reference](https://docs.harly.dev/deployment/cli), and
[operations guide](https://docs.harly.dev/self-hosting/operations) before
production use.

### Managed platforms

| Platform                  | Entry point                                                                                                      | Notes                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Render                    | [Deploy to Render](https://render.com/deploy?repo=https://github.com/Vytral/harly)                               | Provisions web, scheduler, and managed PostgreSQL from `render.yaml`; S3-compatible storage is required for uploads. |
| DigitalOcean App Platform | [Deploy on DigitalOcean](https://cloud.digitalocean.com/apps/new?repo=https://github.com/Vytral/harly/tree/main) | Uses `.do/app.yaml`; S3-compatible storage is required for uploads.                                                  |
| Railway                   | `npx @harly/cli deploy railway`                                                                                    | The CLI provisions the full multi-service topology through Railway's API.                                          |
| Fly.io                    | `npx @harly/cli deploy fly prepare`                                                                                | Generates the deployment configuration; attach Managed Postgres and deploy.                                        |

See the [cloud deployment guide](https://docs.harly.dev/deployment/cloud) for
secrets, databases, storage, domains, and platform-specific recovery details.
Harly is not designed for serverless-only platforms such as Vercel because the
scheduler requires a persistent background process.

### Before inviting your team

1. Use an HTTPS `HARLY_URL` and independent production secrets.
2. Run `npx @harly/cli doctor` after deployment and after upgrades.
3. Configure encrypted, off-host backups of PostgreSQL and uploads, then prove
   a restore on a disposable installation.
4. Complete `/setup` with `HARLY_SETUP_SECRET` and the intended owner email;
   registration becomes invite-only afterward.
5. Review retention, consent, API-key scopes, integrations, and operator access
   before importing candidate data.

## Documentation

The user-facing manual is published at **[docs.harly.dev](https://docs.harly.dev)**.
Start with the [quickstart](https://docs.harly.dev/quickstart), then choose the
[CLI reference](https://docs.harly.dev/deployment/cli),
[cloud deployment guide](https://docs.harly.dev/deployment/cloud), or
[API overview](https://docs.harly.dev/developers/api-overview).

The apps/docs directory is the source for the published manual. Repository notes
under docs/ are implementation and operator records; use the public docs for
the supported user-facing procedures.

## Stack

- Next.js App Router, React, TypeScript, and Turborepo
- Drizzle ORM with PostgreSQL 16
- Better Auth with workspace organizations and role-based permissions
- Tailwind CSS, shadcn/ui, and Radix UI
- Local or S3-compatible storage, including AWS S3, Cloudflare R2, and MinIO
- Resend and React Email
- Vercel AI SDK with configurable OpenAI-compatible providers

## Development

### Requirements

- Node.js 22 or newer
- pnpm 9.15.0 (corepack enable)
- Docker Engine 24+ and Docker Compose 2.20+

### Run locally

```bash
git clone https://github.com/Vytral/harly.git
cd harly
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

pnpm dev starts PostgreSQL, applies Drizzle migrations, and starts the web app
at `http://localhost:3000`. If PostgreSQL is already running, set `DATABASE_URL`
in `.env.local` and use `pnpm dev:web` instead.

Useful commands:

```bash
pnpm db:seed:demo
pnpm db:studio
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @harly/cli test
```

For contribution expectations, migration rules, validation, and safe test data,
read CONTRIBUTING.md. For private vulnerability reporting, read SECURITY.md.

## Repository layout

```txt
apps/web          Core Harly ATS application
apps/docs         Public documentation site
apps/marketing    Marketing site placeholder
packages/db       Drizzle schema, migrations, and database client
packages/auth     Better Auth integration
packages/api      REST API contracts, keys, and webhooks
packages/storage  Local and S3-compatible storage adapters
packages/emails   React Email templates and sender
tooling/harly     @harly/cli installer and operations CLI
tooling/docker    Development Compose and deployment helpers
docs/             Operator, architecture, and contributor notes
```

## Project status and support

Harly is maintained by its open-source contributors and currently targets small
self-hosted teams. We do not offer a hosted service, SLA, or managed recovery;
operators remain responsible for infrastructure, backups, access controls, and
legal obligations.

- Feature requests and reproducible bugs: [GitHub Issues](https://github.com/Vytral/harly/issues)
- Roadmap: [ROADMAP.md](ROADMAP.md)
- Security reports: [SECURITY.md](SECURITY.md) and private GitHub Security Advisories
- CLI package: [@harly/cli on npm](https://www.npmjs.com/package/@harly/cli)

## License

Harly is licensed under the MIT License.

The Harly name and logo are trademarks or brand assets of their respective
owner and are not automatically licensed under the MIT License.
