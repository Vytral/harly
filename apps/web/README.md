# Harly — Core Application

The main Harly ATS application. Self-hostable and cloud-hostable from the same codebase.

Built with Next.js App Router, TypeScript, Drizzle ORM, Better Auth, Tailwind CSS, and shadcn/ui.

## Structure

```txt
src/
  app/              Next.js App Router routes
    (auth)          Login, signup, forgot password, OAuth callbacks
    (onboarding)    Workspace setup wizard
    (dashboard)     Main app — jobs, pipeline, candidates, settings, etc.
    (portal)        Candidate self-service portal
    (public)        Public job board, career pages, apply forms
    api/            REST API v1, auth routes, cron endpoints, webhooks
    embed/          Embeddable job widget
  features/         27 feature modules (jobs, pipeline, candidates, interviews, offers, tasks, reports, career-page, etc.)
  components/       Shared dashboard components (sidebar, topbar, command menu, notifications)
  lib/              Utilities (AI, resume parsing, email, search, etc.)
```

## Features

Jobs, Pipeline (Kanban + list), Candidates, Interviews, Offers, Tasks, Reports, Career Pages (4 templates), Notifications, API v1, Integrations (Google Calendar, Cal.com, Slack), Security (2FA, passkeys, SSO), Candidate Portal, AI features (CV parsing, job descriptions, scoring), Dark mode, GDPR compliance, Audit logs.

## Development

Run from the repository root:

```bash
pnpm dev          # Start Docker Postgres + migrate + dev server
pnpm dev:web      # Dev server only (external DB)
pnpm build        # Production build
pnpm lint         # Lint all packages
pnpm typecheck    # Type-check all packages
```
