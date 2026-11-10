<p align="center">
  <img src="public/banner-harly.webp" alt="Harly, an open-source applicant tracking system" width="1200" />
</p>

<p align="center">
  The open-source applicant tracking system you run on your own server.
</p>

<p align="center">
  <a href="https://github.com/Vytral/harly/releases/latest"><img src="https://img.shields.io/github/v/release/Vytral/harly?label=release" alt="Latest release" /></a>
  <a href="https://www.npmjs.com/package/@harly/cli"><img src="https://img.shields.io/npm/v/@harly/cli?label=%40harly%2Fcli" alt="@harly/cli on npm" /></a>
  <a href="https://github.com/Vytral/harly/actions/workflows/ci.yml"><img src="https://github.com/Vytral/harly/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="https://docs.harly.dev">Documentation</a> ·
  <a href="https://docs.harly.dev/quickstart">Quickstart</a> ·
  <a href="https://docs.harly.dev/developers/api-overview">API</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="ROADMAP.md">Roadmap</a> ·
  <a href="https://github.com/Vytral/harly/discussions">Discussions</a>
</p>

Harly keeps jobs, candidates, interviews, offers and the email around them in
one place, on infrastructure you control. It is built for startups, agencies
and technical teams that want a modern ATS without a per-seat SaaS contract or
handing candidate data to another vendor.

> [!NOTE]
> Harly is in **public beta** (0.x). It is used in production by small teams,
> but test upgrades on a copy and keep verified backups before you import real
> candidate data. See the [release readiness checklist](docs/release-readiness.md).

## Features

**Hiring**
- Jobs drafted from a title, custom application questions, and a pipeline
  board with stage kinds, scorecards and tasks
- A review queue with keyboard shortcuts, rejection reasons, duplicate
  detection and talent pools
- Interviews with calendar sync and video links, offers, document templates
  and **native e-signature** (multiple signers, reminders, signed copy with a
  certificate)
- Reports, a home dashboard, global search and realtime updates

**Candidates**
- A career page builder with templates, live preview, SEO and structured job
  data, plus an embeddable jobs widget
- A candidate portal for status, interviews and offers, with sign-in by
  password, access code, magic link, Google, GitHub, LinkedIn or passkey
- Privacy tooling: consent records, retention rules, export and deletion
  requests

**Team and inbox**
- A shared recruiting inbox with Google and Microsoft mailbox sync, templates
  and an outbox that retries
- Role-based access with built-in roles (owner, admin, recruiter, coordinator,
  interviewer, sourcer, viewer) and granular permissions
- MFA, passkeys, SSO and SCIM, and an audit log

**AI, optional and reviewable**
- Harly AI: a chat assistant that searches, summarizes, drafts and proposes
  actions you confirm
- Candidate scoring with cited evidence, and a deterministic rules-based
  evaluator when you do not want an LLM
- Bring your own provider: OpenAI, Anthropic, Google, Azure OpenAI, Groq,
  DeepSeek, Mistral, Together, Fireworks, Cerebras, Ollama or any
  OpenAI-compatible endpoint. Keys are encrypted at rest.

**Integrations and API**
- An **MCP server** so Claude, ChatGPT, Cursor and VS Code can work in Harly
  with the signed-in person's own permissions (OAuth 2.1, scopes, audit,
  revocation)
- A REST API with scoped keys, an OpenAPI spec, webhooks and automations
- Imports from Greenhouse, Lever, Ashby, Workable and CSV; notifications to
  Slack, Discord and Telegram; local or S3-compatible storage

**Operations**
- One command to install on a VPS, with automatic HTTPS through Caddy
- `harly status`, `doctor`, backups, restore, and updates that take a rollback
  backup first, from the CLI or from Settings → Updates
- Works with no external services: no mail provider or AI key is required to
  start

The [documentation](https://docs.harly.dev) covers every feature in detail.

## Quickstart

You need a Linux server with Docker Engine 24+ and Compose 2.20+ (2 vCPU and
4 GB of RAM is comfortable for a small team), Node.js 20.12+ for the CLI, and
a domain pointing at the server.

```bash
npm install -g @harly/cli
harly init
```

The installer checks the host, asks for your domain, generates secrets, starts
PostgreSQL, the app, the scheduler and Caddy, runs migrations, and prints the
link and setup secret for `/setup`, where you create the owner account.

From the installation directory afterwards:

```bash
harly status     # version, health, last backup, certificate
harly backup     # database and uploads to an archive
harly update     # newest stable release, with a rollback backup first
harly doctor     # diagnose problems
```

The [self-hosting guide](https://docs.harly.dev/self-hosting/overview) covers
sizing, DNS and proxy modes, and the [CLI reference](https://docs.harly.dev/deployment/cli)
lists every command. `npx @harly/cli` works too if you do not want a global
install.

### Other platforms

| Platform | How |
| --- | --- |
| Render | [![Deploy to Render](https://img.shields.io/badge/Deploy-Render-46E3B7?logo=render&logoColor=white)](https://render.com/deploy?repo=https://github.com/Vytral/harly) (uses `render.yaml`) |
| DigitalOcean | [![Deploy on DigitalOcean](https://img.shields.io/badge/Deploy-DigitalOcean-0080FF?logo=digitalocean&logoColor=white)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/Vytral/harly/tree/main) (uses `.do/app.yaml`) |
| Railway | `harly deploy railway` |
| Fly.io | `harly deploy fly prepare` |

Managed platforms need S3-compatible storage for uploads. Serverless-only hosts
such as Vercel are not supported, because Harly runs a persistent background
scheduler. Details are in the [cloud guide](https://docs.harly.dev/deployment/cloud).

## Before you invite your team

1. Serve Harly over HTTPS and keep the generated secrets unique.
2. Set up off-host backups and restore one on a test install.
3. Configure email so invitations and candidate messages are delivered.
4. Review roles, retention and consent settings.

Harly provides compliance tooling, not legal advice: your organization is
responsible for its notices, lawful basis and retention decisions. See
[privacy](https://docs.harly.dev/security/privacy).

## Development

Requirements: Node.js 22, pnpm 9.15 (`corepack enable`), and Docker.

```bash
git clone https://github.com/Vytral/harly.git
cd harly
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev          # starts PostgreSQL, applies migrations, serves http://localhost:3000
```

`pnpm db:seed:demo` loads sample data. `pnpm lint`, `pnpm typecheck` and
`pnpm test` are the main checks.

| Path | Contents |
| --- | --- |
| `apps/web` | The Next.js app: dashboard, REST API, MCP server, portal, career pages |
| `apps/docs` | The documentation site ([docs.harly.dev](https://docs.harly.dev)) |
| `apps/telemetry` | The opt-in install telemetry collector |
| `packages/*` | Database schema and migrations, auth, API contracts, emails, storage, UI |
| `tooling/harly` | `@harly/cli` |
| `docs/` | Architecture decisions and maintainer notes |

Built with Next.js, React, TypeScript, PostgreSQL 16 with Drizzle, Better Auth,
Tailwind CSS with Radix UI, React Email, and the Vercel AI SDK.

## Contributing

Bug reports, fixes, docs and ideas are all welcome. Start with
[CONTRIBUTING.md](CONTRIBUTING.md); AI coding agents should read
[AGENTS.md](AGENTS.md).

- **Questions and ideas:** [Discussions](https://github.com/Vytral/harly/discussions)
- **Bugs:** [Issues](https://github.com/Vytral/harly/issues/new/choose)
- **Vulnerabilities:** privately, as described in [SECURITY.md](SECURITY.md)

## License

[MIT](LICENSE). Weak-copyleft dependencies are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The Harly name and logo are
not covered by the MIT license.
