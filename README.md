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
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="ROADMAP.md">Roadmap</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="https://render.com/deploy?repo=https://github.com/Vytral/harly"><img src="https://img.shields.io/badge/Deploy-Render-46E3B7?logo=render&logoColor=white" alt="Deploy to Render" /></a>
  <a href="https://cloud.digitalocean.com/apps/new?repo=https://github.com/Vytral/harly/tree/main"><img src="https://img.shields.io/badge/Deploy-DigitalOcean-0080FF?logo=digitalocean&logoColor=white" alt="Deploy on DigitalOcean" /></a>
  <a href="#deployment"><img src="https://img.shields.io/badge/Self--host-Docker%20%2F%20Fly%20%2F%20Railway-2496ED?logo=docker&logoColor=white" alt="Self-host with Docker, Fly or Railway" /></a>
</p>

> **Public beta.** Harly is intended for small, self-hosted teams while the
> product and deployment workflows continue to mature. Review the [release
> readiness guide](docs/release-readiness.md), test upgrades on a disposable
> installation, and verify backups before importing real candidate data.

## What is Harly?

Harly is a self-hostable ATS for startups, agencies, and technical teams. It
keeps recruiting workflows, candidate data, documents, integrations, and
automation in one place, without a closed SaaS subscription.

## Product capabilities

| Area | Included capabilities |
| --- | --- |
| Recruiting | Jobs, application questions, candidate pipelines with stage kinds, a review queue, rejection reasons, interviews, offers, tasks, scorecards, talent pools, global search, and reports |
| Candidate experience | A career page builder with templates, embeddable widgets, SEO metadata, structured job data, and a candidate portal with password, magic link, OAuth, and passkey sign-in |
| Communication | A shared inbox with Google and Microsoft mailbox sync, email templates, calendars, video interviews, and Slack, Discord, and Telegram notifications |
| Documents and signatures | Document templates, generated offers, and native e-signature with multiple signers, reminders, and a signed copy with a certificate |
| Integrations and automation | ATS imports, storage, REST API, webhooks, automations, realtime events, and an MCP server so Claude, ChatGPT, Cursor, and VS Code can work in Harly with each person's own permissions |
| AI assistance | Harly AI chat, candidate matching and scoring with cited evidence, anonymization, and drafting; optional, human-reviewed, and bring-your-own provider (OpenAI, Anthropic, Google, Azure, Groq, Mistral, DeepSeek, Ollama, and any OpenAI-compatible API) |
| Security and privacy | RBAC with built-in and granular roles, MFA, passkeys, SSO, SCIM, API-key scopes, audit logs, consent, retention, export, and deletion workflows |
| Operations | A guided CLI installer, `harly status`, health checks, backups, restores, and updates from the CLI or from Settings → Updates; works with no mail or AI provider configured |

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
[compliance checklist](https://docs.harly.dev/security/privacy) before using
Harly with real candidate data.

## Deployment

### Self-host with the Harly CLI

The Harly CLI uses a version-pinned GHCR image; your VPS does not need to
compile Next.js or install the monorepo. On a fresh Linux host with Docker:

```bash
npm install -g @harly/cli
harly init
```

The guided installer checks the host, creates PostgreSQL, the migrator, web
app, scheduler, and optional Caddy topology, generates independent secrets,
runs migrations, and waits for public readiness. From the installation
directory, the same CLI manages health checks, backups, restores, upgrades, and
uninstallation:

```bash
harly status
harly backup
harly update
harly doctor
```

Read the [self-hosting guide](https://docs.harly.dev/self-hosting/overview),
[CLI reference](https://docs.harly.dev/deployment/cli), and
[operations guide](https://docs.harly.dev/self-hosting/operations) before
production use. Prefer not to install anything globally? `npx @harly/cli`
runs the same commands.

### Managed platforms

| Platform | Entry point | Notes |
| --- | --- | --- |
| Render | [Deploy to Render](https://render.com/deploy?repo=https://github.com/Vytral/harly) | Provisions web, scheduler, and managed PostgreSQL from `render.yaml`; S3-compatible storage is required for uploads. |
| DigitalOcean App Platform | [Deploy on DigitalOcean](https://cloud.digitalocean.com/apps/new?repo=https://github.com/Vytral/harly/tree/main) | Uses `.do/app.yaml`; S3-compatible storage is required for uploads. |
| Railway | `harly deploy railway` | The CLI provisions the full multi-service topology through Railway's API. |
| Fly.io | `harly deploy fly prepare` | Generates the deployment configuration; attach Managed Postgres and deploy. |

See the [cloud deployment guide](https://docs.harly.dev/deployment/cloud) for
secrets, databases, storage, domains, and platform-specific recovery details.
Harly is not designed for serverless-only platforms such as Vercel because the
scheduler requires a persistent background process.

## Documentation

The user-facing manual is published at **[docs.harly.dev](https://docs.harly.dev)**.
Start with the [quickstart](https://docs.harly.dev/quickstart), then choose the
[CLI reference](https://docs.harly.dev/deployment/cli),
[cloud deployment guide](https://docs.harly.dev/deployment/cloud), or
[API overview](https://docs.harly.dev/developers/api-overview).

The manual's source lives in `apps/docs`, so documentation fixes are pull
requests like any other change.

## Stack

- Next.js App Router, React, TypeScript, and Turborepo
- Drizzle ORM with PostgreSQL 16
- Better Auth with workspace organizations and role-based permissions
- Tailwind CSS, shadcn/ui, and Radix UI
- Local or S3-compatible storage, including AWS S3, Cloudflare R2, and MinIO
- React Email over SMTP or Resend
- Vercel AI SDK with a bring-your-own model provider

## Contributing

Bug reports, fixes, documentation, and ideas are welcome. Read
[CONTRIBUTING.md](CONTRIBUTING.md) for local setup, checks, and migration
rules; AI coding agents should follow [AGENTS.md](AGENTS.md). Release
maintainers use [RELEASING.md](RELEASING.md).

## Project status and support

Harly is maintained by its open-source contributors and currently targets small
self-hosted teams. We do not offer a hosted service, SLA, or managed recovery;
operators remain responsible for infrastructure, backups, access controls, and
legal obligations.

- Questions and ideas: [GitHub Discussions](https://github.com/Vytral/harly/discussions)
- Reproducible bugs: [GitHub Issues](https://github.com/Vytral/harly/issues/new/choose)
- Release notes: [CHANGELOG.md](CHANGELOG.md)
- Roadmap: [ROADMAP.md](ROADMAP.md)
- Security reports: privately, as described in [SECURITY.md](SECURITY.md)
- CLI package: [@harly/cli on npm](https://www.npmjs.com/package/@harly/cli)

## License

Harly is licensed under the MIT License. Dependencies with weak-copyleft licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The Harly name and logo are trademarks or brand assets of their respective
owner and are not automatically licensed under the MIT License.
