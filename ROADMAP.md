# Harly roadmap

Harly is an open-source, self-hostable applicant tracking system for teams that
want to run recruiting on infrastructure they control. This document describes
product direction and sequencing; it is not a promise that every item will ship
on a fixed date.

Last reviewed: 2026-10-28

## How to read this roadmap

| Status | Meaning |
| --- | --- |
| Shipped | Available in the current codebase and documented. A provider may still require its own account, approval, or credentials. |
| Now | Work in the current release cycle (v0.2.4). Items are listed in priority order. |
| Next | The next product investments after v0.2.4, expected for v0.4 or later. |
| Later | Valuable work that should follow the next product cycle. |
| Exploring | A valid direction, but not a committed initiative. |
| Not planned | Deliberately outside Harly's near-term product boundary. |

Priority is ordered inside each section. Reliability, security, and recoverability
come before breadth.

## What Harly can do today

These capabilities exist in the codebase. Some integrations require separate
provider access, and some areas still need operational hardening. Where a
capability is only partly complete, the Now section says so.

### Recruiting workspace

- Create workspaces, invite members, configure roles, and manage member access
  with built-in and custom roles and contextual permission scopes.
- Create jobs with structured details, compensation, location, employment type,
  custom application questions, rich descriptions, publishing controls, and an
  approval request step before publish.
- Give each job its own pipeline stages. Applications move through a kanban
  pipeline individually or in bulk, and stage history is kept for each
  application.
- Schedule interviews, record feedback, complete or cancel interviews, and use
  tasks, scorecards, talent pools, search, and candidate matching to support the
  hiring team.
- Import candidates from CSV and through maintained adapters for Greenhouse,
  Lever, Ashby, Workable, and Join.
- Use the dashboard search and quick navigation (search v1). Extending it is a
  v0.2.4 theme.

See [Jobs](apps/docs/product/jobs.mdx),
[Candidates and pipeline](apps/docs/product/candidates-and-pipeline.mdx), and
[Interviews and scheduling](apps/docs/product/interviews-and-scheduling.mdx).

### Candidate experience

- Publish career pages and public job pages with application forms, custom
  questions, file uploads, legal notices, canonical URLs, a sitemap, and
  `JobPosting` structured data.
- Provide an authenticated candidate portal for profile, application, interview,
  offer, and document interactions.
- Generate and manage offer documents, native signing flows, evidence, expiry,
  and DocuSeal-backed signatures.

See [Career pages](apps/docs/product/career-page.mdx),
[Candidate portal](apps/docs/product/candidate-portal.mdx), and
[Documents](apps/docs/product/documents.mdx).

### Communication and integrations

- Send transactional and candidate email through Resend or any SMTP server, manage
  templates, and receive inbound mail through Resend or Postmark webhooks.
  Harly has no native Amazon SES API integration; see the Now section for why.
- Connect Google Calendar and Google Meet, Microsoft (Outlook and Teams), video
  providers, Slack, and storage providers. Each requires its own provider
  account and credentials.
- Deliver signed webhooks with retry, replay, delivery history, and test
  endpoints. Consume realtime events.
- Run automations from the dashboard, with dry runs, human approval checkpoints,
  retries, and run history. The public REST API for automations is withdrawn
  (`410 Gone`); see [Automations](apps/docs/developers/automations.mdx).

See [Integrations](apps/docs/integrations/overview.mdx) and
[API and webhooks](apps/docs/developers/api-overview.mdx).

### AI assistance

- Parse supported resume formats with an optional bring-your-own AI key.
- Match candidates to jobs, generate evaluations, summarize interview notes,
  draft job descriptions and emails, anonymize candidate data, and use
  context-aware Harly AI actions.
- Keep AI optional, require human confirmation for consequential writes, and
  record action history for supported actions.

See [AI features](apps/docs/product/ai-features.mdx) and the focused
[AI Copilot roadmap](docs/ai-copilot-roadmap.md).

### Security, privacy, and operations

- Enforce workspace-scoped access with built-in and custom roles, permission
  scopes, MFA, passkeys, SSO, SCIM, API-key scopes, and device-session controls.
- Provide audit logs, consent evidence, retention enforcement, candidate export,
  deletion and anonymization workflows, and workspace legal pages.
- Run the application with PostgreSQL and local or S3-compatible storage. Use
  the Harly CLI for installation, checks, health diagnostics, backup, restore,
  upgrade, and rollback support.

See [Access control](apps/docs/security/access-control.mdx),
[Privacy](apps/docs/security/privacy.mdx), and
[Self-hosting operations](apps/docs/self-hosting/operations.mdx).

## Now — v0.2.4 release cycle

v0.2.4 makes the existing product dependable for a small recruiting team. Its
themes, in priority order, are trustworthy pipeline semantics and metrics,
reliable email and integration health, global search, a first-hour onboarding
path with sample data, and UI system polish.

Every v0.2.4 change must also meet these release gates:

- A clean checkout passes the application, database, CLI, and documentation
  checks. The required checks are listed in [CONTRIBUTING.md](CONTRIBUTING.md).
- Every dashboard action and API route that handles candidate data or
  credentials has an explicit permission and workspace-isolation test.
- Migrations are additive and backward compatible for self-hosters who upgrade
  in place. Custom data backfills are documented with the migration.
- Install, upgrade, backup, restore, and doctor have been exercised on a
  disposable installation before the release is tagged.

### NOW-1 — Trustworthy pipeline semantics and metrics

Stage meaning must come from stored data, not from a stage name. Stage names are
display text that a team can change.

Done when:

- Every job stage has an explicit kind (applied, screening, interview, offer,
  hired, rejected, withdrawn, or custom). Outcome changes use the kind, and
  archived stages keep their history but leave the active pipeline.
- Application status follows stage kind consistently across the board, the
  API, the candidate portal, reports, emails, AI tools, and automations.
- Funnel, source, time-to-hire, dashboard, and Harly AI calculations use the same
  canonical events and remain correct for closed, trashed, and sparse jobs.
- Reports expose freshness, empty, loading, error, and retry states.
- Focused tests cover date ranges, timezone boundaries, missing data, and
  permission-restricted report access.

### NOW-2 — Reliable email and integration health

Make communication trustworthy when providers are slow, revoked, unavailable,
or partially configured.

Done when:

- Outbound email, inbound email, calendar events, video links, signatures, and
  ATS imports expose a clear connected, degraded, or reconnect state.
- Retries are idempotent, provider callbacks are signature-verified, and failed
  work is visible with a safe retry path.
- Sender and domain setup, mailbox sync, attachment handling, and reply threading
  are documented with provider-specific troubleshooting.
- Email providers are documented accurately: Resend and SMTP ship in Harly today.
  Native Amazon SES API support is explicitly deferred. The reason is that SES
  exposes an SMTP interface, which the SMTP provider already covers, and a
  separate SES API integration would add maintenance cost without a clear
  gain for v0.2.4. It is reconsidered only if SMTP cannot meet a real need.

### NOW-3 — Global search

Turn `Cmd/Ctrl + K` from quick navigation into workspace search across jobs,
candidates, applications, tasks, and integrations, with permission-aware
results, keyboard navigation, recents, and deep links.

Done when:

- A recruiter can find a candidate by name, email, skill, or application context
  and reach the correct record.
- Results respect the caller's workspace and role permissions, and never include
  another workspace's records.

### NOW-4 — First-hour onboarding and sample data

Make the first hour understandable without exposing implementation details.

Done when:

- A new owner can create a workspace, invite a teammate, create a job, publish
  it, submit a test application, and understand the next action without a
  maintainer explaining the flow.
- Sample data can be loaded and removed safely for evaluation, and it is clearly
  marked so it is never confused with production candidate data.
- The public beta label, repository link, version, support route, and known
  limitations are visible and consistent.

### NOW-5 — UI system polish

Make the core routes consistent with the design system.

Done when:

- Empty states, loading states, errors, keyboard navigation, mobile layouts,
  contrast, and destructive confirmations are consistent across core routes.
- Colors and surfaces come from semantic tokens, and motion respects
  `prefers-reduced-motion`.

## Next — v0.4 and later

These items are deliberately deferred from v0.2.4. Each has a concrete outcome
and an observable completion gate.

- **Native interview scheduling and reminders.** Interviews can be scheduled and
  tracked today. A native scheduler would add availability-aware slot proposals
  and reminders for candidates and interviewers.
  Completion gate: a recruiter can propose slots, a candidate can book one, and
  reminders are delivered and retried through the reliable email path.
- **Career-page custom domains and draft/publish.** Add preview and publish
  workflows for career pages and support custom domains with verified DNS and TLS.
  Completion gate: a workspace can preview a draft, publish it, and serve its
  careers site from a verified custom domain without breaking legal notices or
  the embedded widget.
- **Rubric editor UI.** Let teams author and version scorecard rubrics in the
  dashboard. Completion gate: a rubric can be created, versioned, and applied to
  a job without changing feedback already recorded against an earlier version.
- **Proactive AI briefs.** Add hiring briefs, missing-feedback and stalled-candidate
  detection, and follow-up queues. Completion gate: every recommendation is
  grounded in workspace evidence, every consequential write is confirmed, and
  candidate content is treated as data rather than instructions.
- **Saved views and personalization.** Let each recruiter save report views,
  dashboard widgets, and task queues per user and workspace. Completion gate:
  layouts persist per user and workspace, respect permissions, and have a reset
  path that never deletes recruiting data.
- **Requisitions and custom candidate fields.** Add requisitions, custom candidate
  and job fields, and offer approval paths. Completion gate: a workspace can
  define a governed approval path, enforce it in the UI and API, and export an
  auditable record of who approved what and when.
- **Import preview, resume, and merge.** Show a preview before a CSV or adapter
  import, resume interrupted jobs, and resolve duplicates with a merge step.
  Completion gate: an import can be previewed, resumed, safely retried, and
  reconciled without duplicate candidates or cross-workspace records.
- **Reusable recruiting templates.** Add reusable job, email, interview-kit,
  scorecard, offer, pipeline, and automation templates with workspace ownership
  and versioning. Completion gate: a team can create a template, apply it to a
  new job, and publish a new version without mutating historical records.
- **Harly AI copilot expansion.** Add more reversible actions and admin-controlled
  workspace memory on top of the proactive briefs. Completion gate: memory is
  visible and removable by an admin, and every write remains reversible or
  confirmed.

## Later — platform and ecosystem scale

### LATER-1 — Provider-neutral integration SDK

Publish stable contracts for email, calendars, video, storage, notifications,
job distribution, and ATS imports so community adapters can be maintained
without copying internal implementation details.

### LATER-2 — Managed Harly Cloud

Explore an optional hosted service with billing, usage limits, managed backups,
support, observability, status reporting, and custom domains. Cloud must remain
an addition to self-hosting, not a prerequisite for core recruiting workflows.

### LATER-3 — Larger deployment profiles

Document and test resource profiles for larger organizations: external
PostgreSQL, separate scheduler workers, object storage, reverse proxies,
load-balancing, observability, and staged migrations. This is operational work,
not a promise of multi-region SaaS availability.

### LATER-4 — Advanced AI personalization

Workspace recruiting guidelines, role-specific criteria, user preferences,
reviewable memory, export and delete controls, and more provider recovery can
follow once the copilot's safety and evaluation baseline is proven.

### LATER-5 — Direct job-board distribution

Publish to job boards through official, authorized provider APIs only. This is
conditional on provider terms that permit it. Harly will not use scraping or
credentials that bypass provider controls.

## Exploring, but not committed

- Authorized professional-profile or sourcing providers with clear consent,
  retention, and human-review controls.
- Additional calendars, mail providers, notifications, and job-distribution
  adapters based on real user demand and provider access.
- Richer employee directory features that help recruiting teams without becoming
  payroll, benefits, PTO, or time-tracking software.
- Native analytics integrations, privacy-preserving product telemetry, and
  optional community-maintained extensions.

## Not planned for the near term

- Payroll, benefits, time tracking, PTO balances, or a full HRIS.
- A proprietary professional-network or candidate database.
- Unauthorized scraping of LinkedIn, job boards, social networks, or external
  candidate databases.
- Automatic hiring decisions without meaningful human review.
- A public REST API for automations. Automations are managed in the dashboard
  until a versioned replacement contract is designed.
- A native Amazon SES API integration. SMTP covers SES through its SMTP interface.
- Feature parity with every enterprise ATS before Harly is dependable for its
  primary audience: small, technical, privacy-conscious teams.

## Product decisions that keep the roadmap honest

| Decision | Consequence |
| --- | --- |
| Self-hosting remains first-class | Core workflows cannot depend on a hosted Harly service, proprietary database, or paid AI provider. |
| Integrations fail recoverably | A provider outage must not erase the local ATS record; retries and reconnects are product features. |
| AI proposes; people decide | Harly may draft, rank, summarize, or propose actions, but it does not silently make hiring decisions. |
| Cross-cutting changes ship deliberately | Pipelines, permissions, portal behavior, reporting, and API contracts require migration and end-to-end coverage together. |
| Provider terms are a boundary | Direct publishing or sourcing is only built on authorized APIs and documented data handling. |

## Contributing to the roadmap

For a large feature request, open a GitHub issue with the user problem, the
affected workflow, data/privacy implications, provider constraints, and a
verifiable completion condition. Roadmap status changes when scope and evidence
change, not merely when a branch is created.
