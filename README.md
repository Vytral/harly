# Harly

Harly is an open-source applicant tracking system for modern teams.

Beautiful, fast, self-hostable recruiting software with a public job board, candidate pipeline, notes, emails, analytics, and developer-friendly APIs.

## Why Harly?

Most ATS products are expensive, slow, closed, and painful to customize.

Harly is built for startups, agencies, and technical teams that want:

- A beautiful recruiter experience
- A public job board with SEO
- A visual hiring pipeline
- Candidate profiles and notes
- Self-hosting
- API-first extensibility
- Modern developer experience

## Tech Stack

- Next.js App Router
- TypeScript
- Server Actions (no tRPC)
- Drizzle ORM + PostgreSQL
- Better Auth (email/password, OAuth, passkeys, organizations)
- Tailwind CSS + shadcn/ui
- Resend + react.email
- S3-compatible storage (AWS S3 / Cloudflare R2 / MinIO)
- Turborepo

## Project Structure

```txt
apps/web        Next.js application (main product)
packages/db     Database schema + 39 migrations (Drizzle)
packages/auth   Better Auth integration
packages/api    REST API v1 + API key auth + webhooks
packages/storage Abstract storage adapters (local + S3)
packages/emails 19 React Email templates
packages/config Shared config (placeholder)
packages/ui     Shared UI components (placeholder)
packages/validators Shared validation schemas (placeholder)
```

## Local Development

Copy `.env.example` to `.env` if you need to customize connection settings.
With the default local Postgres values, start the app from the repo root:

```bash
pnpm dev
```

The dev script starts Docker Postgres, applies Drizzle migrations, then starts
the Next.js app. If you are already running an external database such as Neon,
set `DATABASE_URL` and use:

```bash
pnpm dev:web
```

Useful database commands:

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm db:down
```

## Features

- **Jobs**: CRUD, custom questions, branding, public board with SEO, hiring team, AI-powered description generation
- **Pipeline**: Kanban board + list view, drag & drop, bulk actions, search, filters
- **Candidates**: profiles, notes, timeline, files, AI scoring, tags, talent pool
- **Interviews**: scheduling, Cal.com integration, calendar sync
- **Offers**: extend/withdraw with email notifications
- **API v1**: REST with API keys, OpenAPI spec, outbound webhooks
- **Integrations**: Google Calendar, Cal.com, Slack
- **Career Pages**: 4 templates, builder with live preview
- **Reports**: funnel, time-to-hire, source analytics
- **Tasks**: board view, assign to candidates/jobs
- **Legal**: GDPR compliance, consent, audit logs
- **Security**: 2FA, passkeys, audit logs, RBAC roles

## License

MIT
