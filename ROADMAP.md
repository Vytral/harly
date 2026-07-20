# Harly roadmap

Harly is an open-source, self-hostable applicant tracking system. This roadmap
communicates product direction, not release promises. Priorities may change as
real teams use Harly and the maintainers learn from deployments.

Core recruiting workflows remain usable without AI or paid third-party
services. Integrations may require separate accounts, credentials, commercial
agreements, or usage fees.

Last reviewed: 2026-07-19

## Status and priorities

| Label | Meaning |
| --- | --- |
| Now | Required for launch confidence or actively being finished |
| Next | Planned immediately after the launch baseline |
| Later | Valuable, but not on the critical path |
| Not planned | Explicitly outside Harly's near-term scope |

Priority order inside each section is intentional: reliability and trust come
before breadth, and core workflows come before automation.

## Now — launch confidence

### Core ATS journey

Deliver and verify the complete recruiter workflow:

1. Create a workspace and publish a job.
2. Receive and review an application.
3. Move the candidate through the default pipeline.
4. Schedule and complete an interview.
5. Record feedback and send an offer.
6. Close the role and preserve the relevant history.

The release gate is an authenticated end-to-end scenario, not only unit tests.
See [the launch audit](AUDITORIA_LANZAMIENTO.md) and [the production checklist](docs/launch-checklist.md).

### Trust, security, and operations

- Close remaining critical authorization and workspace-isolation findings.
- Finish the release-candidate pass for backups, restores, migrations,
  upgrades, scheduler locks, and failure recovery.
- Keep secrets encrypted, logs free of sensitive candidate data, and public
  file/application routes workspace-safe.
- Maintain reproducible Docker and CLI installation from a clean checkout.
- Complete the authenticated smoke path on the release image before publishing.

### Reporting hardening — in progress

- [x] Use the first transition into `Hired` as the canonical hire event.
- [x] Calculate time-to-hire from application date to the `Hired` transition.
- [x] Make Reports, Dashboard, and Harly AI use the same hire clock.
- [x] Exclude jobs in the trash while preserving metrics for normally closed
  jobs.
- [ ] Make the funnel resilient to custom stage names and different workflows.
- [x] Add a dedicated `reports:read` permission for the Reports page and
  Harly AI.
- [ ] Add freshness metadata, error/retry states, and focused report tests.
- [ ] Add operational filters, drill-downs, and CSV export.

### Launch quality

- Validate onboarding and daily workflows with real small teams.
- Verify keyboard navigation, responsive behavior, contrast, loading states,
  empty states, and recoverable errors at the launch breakpoints.
- Publish operator, upgrade, backup/restore, contributor, and security-contact
  documentation.

## Next — post-launch product foundation

### Custom pipelines — planned after launch

Every job should be able to define its own hiring workflow. A company may use
`Applied → Screening → Interview → Offer → Hired`; another may use
`Applied → Coffee with CEO → Reference Check → Hired`.

This initiative is intentionally post-launch because it crosses the data model,
permissions, UI, notifications, portal, API, and reporting layers.

- Add a per-job pipeline builder for creating, editing, reordering, and safely
  removing stages.
- Add semantic stage outcomes (`active`, `interview`, `offer`, `hired`,
  `rejected`) so behavior never depends on the visible stage name.
- Migrate existing default stages without changing current applications.
- Handle candidates when a stage is removed or merged.
- Connect the semantics to Pipeline, Reports, Dashboard, Portal, reminders,
  emails, webhooks, AI tools, and public API endpoints.
- Add permissions, audit history, optimistic concurrency, migration checks, and
  end-to-end tests.

### Flexible recruiting workflows

- Custom fields for jobs and candidate profiles.
- Job requisitions and offer approval workflows.
- Reusable job, email, interview, scorecard, and pipeline templates.
- Saved report filters, configurable exports, and manager-facing views.
- Better candidate-to-job matching and workflow-specific ranking inside Jobs.

### Enterprise administration

- SCIM provisioning and deeper identity administration.
- More granular analytics and report access controls.
- Documented integration SDK for community-maintained adapters.
- Stronger audit exports and retention controls for regulated teams.

## Later — ecosystem and assisted sourcing

- Additional authorized calendar, email, automation, and job-distribution
  integrations, subject to provider access and terms.
- AI-assisted sourcing strategies and Boolean/X-Ray query generation.
- An open `SourcingProvider` interface for self-hosted operators to connect an
  authorized professional-profile data provider.
- Optional provider adapters that normalize results, detect duplicates, rank
  matches against job criteria, and let recruiters review candidates before
  importing them into Harly.
- A managed Harly offering without removing self-hosting or making core
  recruiting workflows depend on the hosted service.

## Not planned for the near term

- Payroll, benefits, time tracking, or a full HRIS.
- A proprietary professional-network database.
- Automatic hiring decisions without meaningful human review.
- Unauthorized scraping of LinkedIn, job boards, social networks, or external
  candidate databases.
- Feature parity with every enterprise ATS before Harly is dependable for its
  primary audience: small, technical, privacy-conscious teams.

AI keys alone do not provide access to LinkedIn, job boards, social networks,
or external candidate databases. Any future sourcing adapter must respect the
source's terms, applicable privacy law, retention rules, and human review.

## Decision log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-07-19 | Custom pipelines moved to post-launch | The feature is cross-cutting; rushing it would risk launch stability. |
| 2026-07-19 | Reports treat trashed jobs as excluded and closed jobs as historical | Trash is logical deletion; closing a job should not erase its recruiting history. |
| 2026-07-19 | Hire metrics use the first `Hired` stage transition | `updatedAt` is mutable and cannot be a reliable hiring timestamp. |

## Contributing

Roadmap items are outcome-oriented. Before starting a large implementation,
open a GitHub discussion or issue so the use case, provider constraints, data
model, and maintenance burden can be agreed upon. See
[CONTRIBUTING.md](CONTRIBUTING.md).
