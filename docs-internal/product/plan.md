# OpenHire — Product Plan

## Current state

A functional Next.js prototype with:
- Drizzle ORM schema (users, workspaces, jobs, candidates, applications, pipeline stages,
  notes, activity events)
- Kanban pipeline with drag & drop (dnd-kit)
- Public job application form
- Server actions for jobs and applications
- Hardcoded demo workspace (no real auth)
- No file storage, no email, no real multi-tenancy

It validates the data model and UX direction. It is not production-ready.

## Target state

A production-grade, self-hosteable ATS with:
- Real authentication (Better Auth — Google OAuth + magic link)
- Real multi-tenancy (workspace per org, invite members, roles)
- File uploads (CVs via R2/S3)
- Transactional email (Resend)
- Customizable job board (branding, domain, questions)
- One-command setup (`npx @harly/create`)
- Docker Compose for self-hosting
- Deploy templates for Railway and Fly.io
- Public docs and landing page

## Milestones

| # | Milestone | Target | Status |
|---|-----------|--------|--------|
| 1 | Monorepo restructure | Week 1 | 🔲 |
| 2 | Auth + real multi-tenancy | Week 3 | 🔲 |
| 3 | File storage + email | Week 3 | 🔲 |
| 4 | Job board + application flow | Week 5 | 🔲 |
| 5 | Pipeline + candidate profiles | Week 6 | 🔲 |
| 6 | Dashboard + analytics | Week 7 | 🔲 |
| 7 | `npx @harly/create` CLI | Week 9 | 🔲 |
| 8 | Landing page live | Week 9 | 🔲 |
| 9 | Docs published | Week 10 | 🔲 |
| 10 | Product Hunt launch | Week 10 | 🔲 |

## Technical decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Framework | Next.js 15 (App Router) | Already in place, ecosystem maturity |
| Auth | Better Auth | Native Drizzle adapter, multi-tenant orgs built-in |
| ORM | Drizzle | Already in place, lightweight, SQL-first |
| Database | PostgreSQL | Already in place, standard for self-hosting |
| Storage | Cloudflare R2 (S3-compatible) | Generous free tier, no egress fees |
| Email | Resend + React Email | Best DX for transactional email in Next.js ecosystem |
| Monorepo | Turborepo | Standard for Next.js monorepos, good caching |
| Package manager | pnpm | Faster, better workspace support than npm |
| Styling | Tailwind v4 | Already in place |
| Deploy | Docker Compose + Railway + Fly.io | Broadest self-hosting coverage |

## Open questions

- Should the job board live on a subdomain per workspace (acme.harly.app) or on a
  path (/board/acme)? Subdomain is better UX but harder to set up for self-hosters.
- Do we support custom domains for the job board in v1 or defer to v1.1?
- Should we use Turborepo or just a simple pnpm workspace without full monorepo tooling?
- Where do we store uploaded CVs for self-hosters who don't have R2/S3? Local disk option?

## Risks

- **Scope creep.** The feature list is long. Ruthlessly cut anything not needed for
  a working ATS before August.
- **Auth complexity.** Better Auth multi-tenant setup can get tricky. Time-box it.
- **No team.** Solo project. Avoid over-engineering. Ship working code over perfect code.
- **PAES + school.** Time is limited. Code in focused blocks. Use LLMs aggressively
  for boilerplate.

## Next actions

1. Create `docs-internal/` with all idea.md and plan.md files ← you are here
2. Restructure project into monorepo (`apps/`, `packages/`, `tooling/`)
3. Install Better Auth and wire up Google OAuth + magic link
4. Replace hardcoded workspace with real session-based workspace resolution
5. Add Cloudflare R2 for file uploads
