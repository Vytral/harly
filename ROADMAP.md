# Harly Roadmap

Harly is an open-source, self-hostable applicant tracking system. This roadmap
communicates direction rather than release commitments: priorities may change
as maintainers learn from real deployments and community feedback.

Core recruiting workflows remain usable without AI or paid third-party
services. Integrations that depend on external providers may require separate
accounts, credentials, commercial agreements, or usage fees.

## Now — launch confidence

- Harden the end-to-end hiring journey: create a workspace, publish a job,
  receive and review an application, schedule an interview, and send an offer.
- Improve first-run setup, deployment diagnostics, backups, restores, and
  upgrade documentation for self-hosted operators.
- Expand automated coverage for permissions, workspace isolation, queues,
  public applications, and destructive privacy operations.
- Validate onboarding and daily workflows with real small teams; prioritize
  reliability, accessibility, performance, and clear empty/error states.
- Publish complete operator and contributor documentation.

## Next — adaptable hiring workflows

- Custom fields for jobs and candidate profiles.
- Job requisition and offer approval workflows.
- Reusable job, email, interview, and scorecard templates.
- Deeper reporting, saved filters, and configurable exports.
- SCIM provisioning and further enterprise identity administration.
- A documented integration SDK for community-maintained adapters.

## Later — ecosystem and assisted sourcing

- Additional authorized calendar, email, automation, and job-distribution
  integrations, subject to provider access and terms.
- AI-assisted sourcing strategies and Boolean/X-Ray query generation.
- An open `SourcingProvider` interface for self-hosted operators to connect an
  authorized professional-profile data provider.
- Optional provider adapters that normalize results, detect duplicates, rank
  matches against job criteria, and let a recruiter review candidates before
  importing them into Harly.
- A managed Harly offering, without removing self-hosting or making core
  recruiting workflows dependent on the hosted service.

AI keys alone do not provide access to LinkedIn, job boards, social networks,
or external candidate databases. Harly will not promise or implement sourcing
through unauthorized scraping. Any future adapter must respect the source's
terms, applicable privacy law, retention rules, and human review requirements.

## Not planned for the near term

- Payroll, benefits, time tracking, or a full HRIS.
- A proprietary professional-network database.
- Automatic hiring decisions without meaningful human review.
- Feature parity with every enterprise ATS before Harly is dependable for its
  primary audience: small, technical, privacy-conscious teams.

## Contributing

Roadmap items are intentionally outcome-oriented. Before starting a large
implementation, open a GitHub discussion or issue so the use case, provider
constraints, data model, and maintenance burden can be agreed upon. See
[CONTRIBUTING.md](CONTRIBUTING.md) for repository guidelines.
