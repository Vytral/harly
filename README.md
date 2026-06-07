# OpenHire

OpenHire is an open-source applicant tracking system for modern teams.

Beautiful, fast, self-hostable recruiting software with a public job board, candidate pipeline, notes, emails, analytics, and developer-friendly APIs.

## Why OpenHire?

Most ATS products are expensive, slow, closed, and painful to customize.

OpenHire is built for startups, agencies, and technical teams that want:

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
- tRPC
- Drizzle ORM
- PostgreSQL
- Better Auth
- Tailwind CSS
- shadcn/ui
- Resend
- react.email
- Uploadthing / S3-compatible storage
- Turborepo

## Project Structure

```txt
apps/web        Next.js application
packages/db     Database schema and migrations
packages/auth   Authentication utilities
packages/api    tRPC routers and server logic
packages/ui     Shared UI components
packages/emails Email templates
packages/config Shared config
packages/validators Shared validation schemas
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
