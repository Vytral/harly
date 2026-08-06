# Harly roadmap

Harly is an open-source, self-hostable applicant tracking system for teams that
want to run recruiting on infrastructure they control. This document describes
product direction and sequencing; it is not a promise that every item will ship
on a fixed date.

Last reviewed: 2026-08-05

## How to read this roadmap

| Status | Meaning |
| --- | --- |
| Shipped | Available in the current codebase and documented. A provider may still require its own account, approval, or credentials. |
| Now | The next work needed to make the public beta dependable for real teams. |
| Next | The next product investments after the beta foundation is stable. |
| Later | Valuable work that should follow the next product cycle. |
| Exploring | A valid direction, but not a committed initiative. |
| Not planned | Deliberately outside Harly's near-term product boundary. |

Priority is ordered inside each section. Reliability, security, and recoverability
come before breadth.

## What Harly can do today

The historical wishlist has become a substantial product. These capabilities are
implemented today, although some integrations require separate provider access
and some areas still need operational hardening.

### Recruiting workspace

- Create workspaces, invite members, configure roles, and manage member access.
- Create jobs with structured details, compensation, location, employment type,
  custom application questions, rich descriptions, and publishing controls.
- Review applications in a kanban pipeline, move candidates individually or in
  bulk, preserve stage history, and maintain candidate notes, tags, files, and
  activity.
- Schedule interviews, record feedback, complete or cancel interviews, and use
  tasks, scorecards, talent pools, search, and candidate matching to support the
  hiring team.
- Import candidates from CSV and expose a versioned REST API for jobs,
  candidates, applications, interviews, offers, tasks, scorecards, pool entries,
  automations, and webhooks.

See [Jobs](apps/docs/product/jobs.mdx),
[Candidates and pipeline](apps/docs/product/candidates-and-pipeline.mdx), and
[Interviews and scheduling](apps/docs/product/interviews-and-scheduling.mdx).

### Candidate experience

- Publish branded career pages and public job pages with application forms,
  custom questions, file uploads, legal notices, and structured job metadata.
- Provide an authenticated candidate portal for profile, application, interview,
  offer, and document interactions.
- Generate and manage offer documents, native signing flows, evidence, expiry,
  and DocuSeal-backed signatures.

See [Career pages](apps/docs/product/career-page.mdx),
[Candidate portal](apps/docs/product/candidate-portal.mdx), and
[Documents](apps/docs/product/documents.mdx).

### Communication and integrations

- Send transactional and candidate emails, manage templates, receive inbound
  mail, and work from the inbox/replies surfaces.
- Connect Google Calendar/Meet, Microsoft/Outlook/Teams, Zoom, Jitsi, Slack,
  storage providers, and supported ATS import adapters.
- Deliver signed webhooks with retry, replay, delivery history, and test
  endpoints; consume realtime events and run versioned automations with dry
  runs, approval, retries, and rollback.

See [Integrations](apps/docs/integrations/overview.mdx),
[API and webhooks](apps/docs/developers/api-overview.mdx), and
[Automations](apps/docs/developers/automations.mdx).

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
  deletion/anonymization workflows, and workspace legal pages.
- Run the application with PostgreSQL and local or S3-compatible storage; use
  the Harly CLI for installation, checks, health diagnostics, backup, restore,
  upgrade, rollback support, and managed-cloud preparation.

See [Access control](apps/docs/security/access-control.mdx),
[Privacy](apps/docs/security/privacy.mdx), and
[Self-hosting operations](apps/docs/self-hosting/operations.mdx).

## Now — make the beta dependable

These initiatives are the current focus. They close the gap between “the
feature exists” and “a small recruiting team can depend on it.”

### NOW-1 — Release, upgrade, and recovery confidence

Make every release reproducible and recoverable for a self-hosted operator.

Done when:

- A clean checkout passes application, database, CLI, and documentation checks.
- The published image, release manifest, CLI, migrations, and changelog refer
  to the same release and image digest.
- Install, first-owner setup, upgrade, rollback, backup, restore, and doctor
  have been exercised on a disposable installation.
- The operator has a tested path for migrations, scheduler failures, stale
  locks, provider failures, and a failed upgrade.

### NOW-2 — Security and privacy proof

Turn the existing controls into a repeatable verification matrix rather than a
collection of settings.

Done when:

- Every dashboard action and API route has an explicit permission and workspace
  isolation test where it handles candidate data or credentials.
- Custom roles, privilege ceilings, SSO/SCIM lifecycle, MFA/passkeys, API-key
  rotation, webhook secrets, and device revocation are covered by an operator
  runbook.
- Candidate export, deletion/anonymization, retention, consent, audit export,
  and private resume access have documented evidence and failure recovery.
- The launch report contains no unresolved critical or high-severity finding.

### NOW-3 — Integration recovery and email operations

Make communication trustworthy when providers are slow, revoked, unavailable,
or partially configured.

Done when:

- Outbound email, inbound email, calendar events, video links, signatures, and
  ATS imports expose a clear connected/degraded/reconnect state.
- Retries are idempotent, provider callbacks are signature-verified, and failed
  work is visible with a safe retry path.
- Sender/domain setup, mailbox sync, attachment handling, and reply threading
  are verified with documented provider-specific troubleshooting.
- SMTP and AWS SES support have either shipped with tests and documentation or
  been explicitly deferred; “email supported” never implies every provider.

### NOW-4 — Reporting users can trust

Finish the reporting foundation before adding more charts.

Done when:

- Funnel, source, time-to-hire, dashboard, and Harly AI calculations use the
  same canonical events and remain correct for closed, trashed, and sparse jobs.
- Custom stage semantics do not depend on a visible stage name.
- Reports expose freshness, empty, loading, error, and retry states.
- Focused tests cover date ranges, timezone boundaries, missing data, and
  permission-restricted report access.

### NOW-5 — Onboarding and daily-workflow polish

Make the first hour understandable without exposing implementation details.

Done when:

- A new owner can create a workspace, invite a teammate, create a job, publish
  it, submit a test application, and understand the next action without a
  maintainer explaining the flow.
- Empty states, loading states, errors, keyboard navigation, mobile layouts,
  contrast, and destructive confirmations are consistent across core routes.
- Demo data can be loaded and removed safely for evaluation without ever being
  confused with production candidate data.
- The public beta label, repository link, version, support route, and known
  limitations are visible and consistent.

## Next — expand the recruiting product

These are the next coherent product initiatives once the beta foundation is
stable. Each item has a concrete outcome and an observable completion gate.

### NEXT-1 — Per-job pipelines and workflow semantics

Allow each job to define its own stages without breaking applications, portal
progress, permissions, notifications, reports, API clients, or automations.

Completion gate: create, reorder, rename, merge, and retire stages on one job;
existing applications retain history; semantic outcomes such as `interview`,
`offer`, `hired`, and `rejected` remain stable; API, portal, reports, emails,
AI tools, and automations all pass end-to-end tests.

### NEXT-2 — Career pages and job distribution

Turn the career-page builder into a growth surface with reusable templates,
preview/publish workflows, custom domains, canonical SEO metadata, sitemaps,
`JobPosting` structured data, richer content blocks, and measurable application
conversion.

Completion gate: a workspace can publish a branded careers site, share a job
with a canonical URL, pass structured-data validation, and receive an
application without breaking legal notices or the embedded widget.

Direct LinkedIn or other job-board publishing is conditional on an official,
authorized provider API and acceptable terms. Harly will not use scraping or
credentials that bypass provider controls.

### NEXT-3 — Real global search

Turn `Cmd/Ctrl + K` from quick navigation into workspace search across jobs,
candidates, people, applications, tasks, and integrations, with permission-
aware results, keyboard navigation, recents, and deep links.

Completion gate: a recruiter can find a candidate by name, email, skill, or
application context and reach the correct record without leaking another
workspace's result.

### NEXT-4 — Sourcing and import ecosystem

Make candidate intake portable: robust CSV mapping, duplicate resolution,
import previews, resumable jobs, progress/error reports, and maintained adapters
for supported ATS providers.

Completion gate: an import can be previewed, resumed, safely retried, audited,
and rolled back or reconciled without duplicate candidates or cross-workspace
records.

### NEXT-5 — Reusable recruiting templates

Add reusable job, email, interview-kit, scorecard, offer, pipeline, and
automation templates with workspace ownership and versioning.

Completion gate: a team can create a template, apply it to a new job, update a
new version without mutating historical records, and restrict who can publish or
edit templates.

### NEXT-6 — Personalizable team workspace

Let each recruiter and workspace configure dashboard widgets, saved report
views, task queues, notification preferences, and team directory metadata
without turning Harly into a general HRIS.

Completion gate: layout and saved views persist per user/workspace, respect
permissions, work on mobile, and have a reset path that never deletes recruiting
data.

### NEXT-7 — Deeper governed hiring workflows

Support custom candidate/job fields, requisitions, offer approvals, hiring-team
decision policies, richer audit exports, and retention policies for teams with
more formal controls.

Completion gate: a workspace can define a governed approval path, enforce it in
the UI and API, and export an auditable record of who approved what and when.

### NEXT-8 — Harly AI copilot expansion

Continue the focused AI roadmap with proactive hiring briefs, missing-feedback
and stalled-candidate detection, follow-up queues, integration recovery, more
reversible actions, and admin-controlled workspace memory.

Completion gate: every recommendation is grounded in workspace evidence, every
consequential write is confirmed, candidate content is treated as data rather
than instructions, and evaluation metrics are tracked in live smoke tests.

### NEXT-9 — Evaluation, identity, and anti-abuse polish

Close the smaller gaps that matter during evaluation and public use: a safe
load/remove demo workspace, optional Turnstile protection for public forms,
avatar upload and fallback behavior, referral capture in onboarding, an optional
managed-cloud work-email policy, a signed-in root redirect to the app, and a
consistent beta/OSS/version/repository surface.

Completion gate: a prospective team can evaluate Harly with disposable data,
remove that data cleanly, enable anti-bot protection without breaking legitimate
applications, and understand which product/version they are running before
inviting colleagues.

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
reviewable memory, export/delete controls, and more provider recovery can follow
once the copilot's safety and evaluation baseline is proven.

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
