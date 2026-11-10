# Roadmap

Where Harly is going. What already shipped is in the [changelog](CHANGELOG.md)
and the [documentation](https://docs.harly.dev); this page is only about what
comes next.

_Last reviewed: 2026-11-09. Current release: 0.4.0._

Plans change as we learn. Work in progress is tracked in
[issues](https://github.com/Vytral/harly/issues) and
[milestones](https://github.com/Vytral/harly/milestones); ideas start in
[Discussions](https://github.com/Vytral/harly/discussions/categories/ideas).

## Now: 0.5.0

- **Localization.** The interface and emails in Spanish, Brazilian Portuguese,
  German, French and Dutch, with community translation through Crowdin.
- **MCP client compatibility.** Accept the client metadata documents that
  Claude and VS Code send, so they can connect without manual registration.

## Next

Ordered roughly by priority. Each item is done when the stated outcome works
end to end, through the interface and the API.

- **Interview self-scheduling.** A recruiter proposes slots from interviewer
  availability, the candidate books one, and reminders go out through the
  normal email path.
- **Career-page custom domains.** Serve a careers site from a verified domain
  with automatic TLS, with draft and publish for page changes.
- **Rubric editor.** Create and version scorecard rubrics in the dashboard,
  without changing feedback recorded against an earlier version.
- **Requisitions and custom fields.** Custom candidate and job fields, job
  requisitions and offer approvals, with an auditable record of who approved
  what.
- **Import preview and merge.** Preview a CSV or ATS import, resume an
  interrupted one, and merge duplicates instead of creating them.
- **Reusable templates.** Versioned job, interview-kit, scorecard, pipeline and
  automation templates that a team applies to new jobs.
- **Saved views.** Per-user saved filters, report views and task queues.
- **Proactive AI briefs.** Stalled candidates, missing feedback and follow-ups,
  every suggestion grounded in workspace data and confirmed before it writes
  anything.

## Later

- **Integration SDK.** Stable contracts so community adapters for email,
  calendars, storage, notifications and imports can live outside the core.
- **Larger deployment profiles.** Tested guidance for external PostgreSQL,
  separate workers, object storage and load balancing.
- **Job-board distribution** through official provider APIs only.
- **Harly Cloud**, an optional hosted service. Self-hosting stays first-class
  and never depends on it.

## Not planned

- Payroll, benefits, time tracking or a full HRIS.
- A proprietary candidate database, or scraping LinkedIn, job boards or social
  networks.
- Hiring decisions made without a person reviewing them.
- Feature parity with every enterprise ATS. Harly is built first for small,
  technical, privacy-conscious teams.

## Principles

| Principle | What it means |
| --- | --- |
| Self-hosting is first-class | Core workflows never require a hosted Harly service or a paid AI provider. |
| AI proposes, people decide | Harly drafts, ranks and summarizes; it does not make hiring decisions on its own. |
| Integrations fail recoverably | A provider outage never loses the ATS record; retries and reconnects are features. |
| Provider terms are a boundary | Sourcing and publishing use authorized APIs only. |

## Suggesting something

Open an idea in [Discussions](https://github.com/Vytral/harly/discussions/categories/ideas)
with the problem you are trying to solve, who has it, and how you handle it
today. Agreed work becomes an issue in a milestone.
