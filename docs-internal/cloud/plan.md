# Harly Cloud — Plan

## Current state

Does not exist yet. Cloud is post-MVP.

## Target state

A hosted instance of Harly running at app.harly.dev with:
- Stripe billing integration
- Usage limits enforced per plan
- Admin panel for managing workspaces
- Observability (logs, error tracking, uptime monitoring)
- Automated backups
- Support channel

## Milestones

### Phase 1 — After core MVP (Q4 2025)
- [ ] Deploy core to production on Railway or Fly.io
- [ ] Add Stripe billing with subscription plans
- [ ] Enforce plan limits (jobs, members, storage)
- [ ] Waitlist → invite → onboard flow
- [ ] Basic admin dashboard to view workspaces and usage
- [ ] Data export available for all plans
- [ ] Support email setup (e.g., careers@harly.dev)
- [ ] Documentation for cloud offering and pricing
- [ ] Custom Domain support for all plans (CNAME to app.harly.dev)

### Phase 2 — Growth (Q1 2026)
- [ ] Admin dashboard (internal): list workspaces, usage, MRR
- [ ] Customer support integration (Crisp or Plain)
- [ ] Usage analytics (PostHog)
- [ ] Automated daily DB backups to R2
- [ ] Error tracking (Sentry)
- [ ] Uptime monitoring (UptimeRobot or similar)

### Phase 3 — Scale (Q2 2026+)
- [ ] Multiple regions
- [ ] SSO (Google Workspace, Okta) for Team+ plans
- [ ] Audit logs for compliance
- [ ] Public status page

## Technical decisions

- Same codebase as core — feature flags or env vars control cloud-specific behavior
- Billing: Stripe (subscriptions + usage-based for storage overages)
- Observability: Sentry (errors) + PostHog (product analytics)
- Hosting: Railway (initial simplicity) → migrate if needed

## Open questions

- Free tier storage: R2 is cheap enough for 500MB per workspace at scale?
- How do we handle workspaces that exceed free limits gracefully (soft vs hard limits)?
- When do we launch cloud relative to open-source launch?

## Risks

- Building cloud too early distracts from making the core product excellent
- Billing complexity can eat weeks — use Stripe Checkout to start, not custom billing
- Support burden on free tier users may be high

## Next actions

Cloud starts after core MVP ships. Do not build this before August.
Focus: get the open-source product right first. Cloud follows.
