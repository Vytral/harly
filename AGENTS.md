# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot and
others) working in this repository. Humans should read
[CONTRIBUTING.md](CONTRIBUTING.md); everything here is consistent with it.

## What this is

Harly is an open-source, self-hosted applicant tracking system (MIT). It is a
pnpm + Turborepo monorepo on Node.js 22:

| Path | What |
| --- | --- |
| `apps/web` | The product: Next.js app, REST API, MCP server (`/mcp`), candidate portal, career pages |
| `apps/docs` | Public documentation site (Mintlify), served at https://docs.harly.dev |
| `apps/telemetry` | Opt-in anonymous install telemetry collector |
| `packages/db` | Drizzle schema and migrations. **Read [packages/db/AGENTS.md](packages/db/AGENTS.md) before touching it.** |
| `packages/*` | Shared auth, api, emails, storage, ui, validators, config |
| `tooling/harly` | `@harly/cli`, the installer and operations CLI (published to npm) |
| `tooling/scripts` | Repository maintenance scripts (release notes extraction) |
| `docs/` | Maintainer material only: ADRs, release readiness, operations policy |

## Commands

```bash
pnpm install --frozen-lockfile
pnpm dev                     # starts Postgres in Docker, migrates, runs the web app
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter web <script>   # one package
pnpm --filter @harly/cli test
pnpm docs:validate && pnpm docs:broken-links
node --test tooling/scripts/*.test.mjs   # changelog and version consistency
```

Run the checks that cover what you changed before saying the work is done. If
a check cannot run (no Docker, no database), say so; never report it as passed.

## Rules that are easy to get wrong

- **Changelog in the same change.** Anything a user, operator or API client
  would notice gets a bullet under `## [Unreleased]` in `CHANGELOG.md`
  (`Added` / `Changed` / `Fixed` / `Removed` / `Security`). CLI changes go in
  `tooling/harly/CHANGELOG.md`. These sections become the GitHub Release notes
  verbatim, so write them for operators, not for reviewers.
- **Releases.** Follow [RELEASING.md](RELEASING.md). Never create, move or
  delete a tag, publish a release or merge a pull request unless the
  maintainer explicitly asks for it in this session.
- **Migrations.** Edit `packages/db/src/schema.ts`, then `pnpm db:generate`.
  Never hand-write migration SQL, never edit an applied migration, keep schema
  changes additive. Details in `packages/db/AGENTS.md`.
- **Authorization.** Every dashboard page calls a permission guard, and every
  data function enforces permission and role scope itself. See "Authorization
  rules" in CONTRIBUTING.md; the page-permission matrix test enforces it.
- **Pipeline stages.** Decide meaning from the stored stage `kind`, never from
  its name. Use the `@harly/db` stage helpers.
- **Candidate data.** Use synthetic data only. Never put real names, emails,
  resumes, secrets or production URLs in code, tests, fixtures or docs.
- **Configuration.** A new environment variable goes into `.env.example` with a
  safe placeholder and into `apps/docs/deployment/configuration.mdx`.
- **Docs.** User and operator documentation lives in `apps/docs` (MDX, English).
  Do not add new Markdown guides under `docs/`. CLI examples use the global
  install (`npm install -g @harly/cli`, then `harly <command>`), not `npx`.
- **Interface text.** User-facing strings in `apps/web` go through the message
  catalogs; add the English string and let translators handle the rest.
- **Toolchain.** Some version ranges differ on purpose (see "Intentional
  toolchain differences" in CONTRIBUTING.md). Do not align them.

## Git

- Branch from `main` with a conventional prefix: `feat/`, `fix/`, `docs/`,
  `chore/`, `ci/`, `refactor/`.
- Conventional commit subjects: `fix(auth): reject expired setup claims`.
  Pull request titles use the same format.
- Commits are authored by the human maintainer who asked for the work. Do not
  add `Co-Authored-By` or other AI attribution trailers, and do not open
  branches named after the agent (`claude/…`, `codex/…`, `copilot/…`).
- Never commit `.env*` files (except `.env.example`), uploads, backups,
  screenshots of real data, or build output.
