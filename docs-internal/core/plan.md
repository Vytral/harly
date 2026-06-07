# OpenHire Core — Plan

## Current state

`apps/app` (formerly the root Next.js project) has:
- Schema: workspaces, users, jobs, jobStages, candidates, applications,
  applicationStageHistory, candidateNotes, candidateFiles, activityEvents
- Working server actions: jobs CRUD, pipeline stage moves, notes, public applications
- Kanban board with dnd-kit and optimistic updates
- Public job application form with validation
- Hardcoded demo workspace — no auth

Missing:
- Real authentication
- Real workspace/org model
- File uploads (CVs stored nowhere)
- Email (no notifications sent)
- Env validation
- Seed data
- Any kind of setup experience

## Target state

A fully working self-hosted ATS:

```
User flow (recruiter):
  Register → create workspace → invite team →
  create job → publish → share job board link →
  receive applications → review pipeline →
  move candidates → hire or reject → send email

User flow (candidate):
  Visit job board → read job → fill application →
  upload CV → submit → receive confirmation email →
  receive status updates
```

## Milestones

### M1 — Auth + workspace (Week 1–2)
- [ ] Install Better Auth with Drizzle adapter
- [ ] Add auth tables to schema (sessions, accounts, verifications)
- [ ] Google OAuth provider
- [ ] Magic link (email) provider via Resend
- [ ] Login / signup pages
- [ ] Onboarding flow: after signup → create workspace (name, slug)
- [ ] Replace getDemoWorkspaceContext() with getSessionWorkspace()
- [ ] Protect all dashboard routes with middleware

### M2 — Multi-tenancy (Week 2)
- [ ] Invite members to workspace by email
- [ ] Roles: owner, admin, recruiter, viewer
- [ ] Role-based access: recruiters cannot delete jobs, viewers cannot create notes
- [ ] Workspace settings page: name, logo, primary color, slug

### M3 — Storage (Week 2–3)
- [ ] Abstract storage behind an interface (local | s3 | r2)
- [ ] Implement R2/S3 adapter with presigned upload URLs
- [ ] Implement local disk adapter for dev
- [ ] Wire upload to candidate application form
- [ ] Show CV in candidate profile (link + PDF preview)
- [ ] File size and type validation (PDF/DOC, max 10MB)

### M4 — Email (Week 3)
- [ ] Resend integration
- [ ] React Email templates: welcome, application confirmation, application received,
      stage move, rejection
- [ ] Email queue / retry logic (basic)
- [ ] Email settings in workspace: sender name, reply-to address

### M5 — Job board (Week 4–5)
- [ ] Workspace-specific job board at /board/[slug] (or subdomain)
- [ ] Branding: logo, primary color, company description
- [ ] Job listing page with filters (type, location, remote)
- [ ] Job detail page with apply button
- [ ] Custom application questions per job
- [ ] Embeddable widget (iframe snippet)
- [ ] SEO: meta tags, OpenGraph per job

### M6 — Pipeline & candidates (Week 5–6)
- [ ] Improved kanban card UI (avatar, status badge, days in stage)
- [ ] Filter pipeline by job, stage, date
- [ ] Candidate profile: full info, all applications, timeline, notes, files
- [ ] Bulk actions: reject multiple, move multiple to next stage
- [ ] Search candidates by name / email / job

### M7 — Dashboard (Week 6–7)
- [ ] Metrics: total jobs, total candidates, applications this week, conversion rate
- [ ] Chart: applications over last 8 weeks
- [ ] Table: jobs with candidate counts per stage
- [ ] Time-to-hire per job

### M8 — Env validation + seed + health (Week 7)
- [ ] Startup env validation with @t3-oss/env-nextjs or similar
- [ ] seed.ts with realistic demo data (3 jobs, 10 candidates, staged applications)
- [ ] GET /api/health endpoint returning db status + version

## Technical decisions

| Decision | Choice | Notes |
|----------|--------|-------|
| Auth | Better Auth | Drizzle adapter, org plugin for multi-tenancy |
| Storage | Abstracted interface | Local for dev, R2/S3 for prod — env-driven |
| Email | Resend + React Email | Best Next.js DX |
| Env validation | @t3-oss/env-nextjs | Fails at build time if vars missing |
| File size limit | 10MB | Enough for any CV format |

## Open questions

- Better Auth's org plugin vs. custom workspace model? Test first.
- Local disk storage for self-hosters without cloud storage? Yes, but document the limits.
- Should job board be on /board/[slug] or require subdomain setup? Start with path, upgrade later.

## Risks

- Better Auth multi-tenant config may be complex. Budget 2 full days.
- Migrating from getDemoWorkspaceContext() touches every data file. Do it in one PR.
- CV upload requires both presigned URL logic and frontend polish. Underestimated effort.

## Next actions

1. Move current codebase to `apps/app/` in monorepo structure
2. Install Better Auth + configure Drizzle adapter
3. Add auth tables to schema + run migration
4. Build login page + Google OAuth flow
5. Build onboarding (create workspace) flow
6. Replace getDemoWorkspaceContext() everywhere
