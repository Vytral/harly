# OpenHire Architecture

OpenHire is intended to be an open-source, self-hostable ATS with an optional
managed cloud offering.

## Boundaries

### Core

Current location: `apps/web`

The core is the real ATS product. It must remain self-hostable and should power
both local installs and the managed cloud app.

Responsibilities:

- Auth
- Workspaces and roles
- Jobs
- Applications
- Candidate profiles
- Pipeline
- Notes
- File storage
- Emails
- Integrations
- Admin setup

### Cloud

Cloud should use the same core codebase with managed configuration.

Responsibilities:

- Hosted app environment
- Billing and plans
- Usage limits
- Operational monitoring
- Backups
- Support workflows

### Marketing

Location: `apps/marketing`

The marketing site should stay separate from the product app.

Responsibilities:

- Landing pages
- Pricing
- Comparisons
- Changelog
- Launch assets
- SEO pages

### Docs

Location: `apps/docs` for now.

Public docs may move to a dedicated repository later.

Responsibilities:

- Install guides
- Deployment guides
- Configuration references
- Upgrade guides
- Integration docs

### Internal Planning

Location: `docs-internal`

This is for product thinking, plans, tradeoffs, and strategy. It is not public
documentation for users.

## Current State

The working product code still lives mostly inside `apps/web`. The package
directories are intentionally lightweight placeholders. Move code into packages
only when a boundary is stable enough to justify the extra indirection.

## Near-Term Rule

Do not add more feature sprawl before these foundations are real:

- Auth
- Storage abstraction
- Environment validation
- Setup wizard
- Self-hosting docs
- Deploy templates
