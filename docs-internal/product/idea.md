# OpenHire — Product Idea

## What is this?

OpenHire is a modern, open-source Applicant Tracking System (ATS) that any developer,
startup, or small company can self-host in minutes — or use as a managed cloud service.

It is a full hiring platform: job board, candidate pipeline, application management,
team collaboration, and recruitment analytics. Beautiful by default. Simple to deploy.
Free to own.

## Who is it for?

**Primary:** Developers and small engineering teams who need a real ATS but refuse to
pay $250+/month for Workable, Greenhouse, or Lever. They want control, customization,
and no vendor lock-in.

**Secondary:** Small companies (1–20 people) that want a professional hiring experience
for candidates without the enterprise price tag.

**Tertiary:** Companies with compliance or data privacy requirements who cannot send
candidate data to third-party SaaS platforms.

## Problem

The ATS market is broken for small orgs:

- **Enterprise tools are absurdly expensive.** Workable starts at $189/mo. Greenhouse
  requires a sales call. Lever is invitation-only pricing. For a 5-person company
  hiring 2 engineers a year, this is irrational.

- **Open-source alternatives are ugly and abandoned.** OpenCATS hasn't had a meaningful
  update in years. Hireflow is bare. Most are PHP monoliths with 2004-era UI.

- **SaaS tools own your data.** Candidate data lives on someone else's server, under
  someone else's terms, with no export guarantee.

- **No middle ground exists.** You either pay enterprise prices or suffer through bad
  tooling. There is no "Cal.com for hiring."

## Differentiation

1. **Modern and beautiful by default.** Not a dashboard from 2015. Designed to feel
   like Linear or Vercel — clean, fast, opinionated.

2. **Self-hosteable in one command.** `npx @harly/create` → answer 5 questions →
   your ATS is running. No DevOps PhD required.

3. **Open-source with real maintenance.** MIT license. Active development. Public
   roadmap. Community contributions welcome.

4. **Managed cloud for those who prefer it.** Same codebase. No feature disparity.
   Pay for convenience, not for features.

5. **Built for customization.** Your branding, your domain, your job board. Candidates
   never see "Powered by Workable" — they see your company.

## Non-goals

- Not an HRIS (no payroll, no onboarding, no org charts).
- Not an enterprise suite (no SSO, no SOC 2, no 99.99% SLA — at least not in v1).
- Not a job aggregator (we don't post to Indeed or LinkedIn automatically — yet).
- Not a replacement for LinkedIn Recruiter.
- Not trying to serve companies with 500+ employees in v1.

## Success criteria

### Short term (August 2025 — NACE submission)
- [ ] Working self-hosted ATS deployable in under 10 minutes
- [ ] `npx @harly/create` wizard functional
- [ ] At least one real company or person using it
- [ ] Public GitHub repo with a compelling README
- [ ] Landing page live at harly.dev

### Medium term (end of 2025)
- [ ] 100+ GitHub stars
- [ ] 10+ self-hosted deployments documented
- [ ] Product Hunt launch
- [ ] Cloud waitlist with 50+ signups

### Long term (2026+)
- [ ] Active open-source community with external contributors
- [ ] Cloud product with paying customers
- [ ] Featured in "awesome-selfhosted" and similar lists
- [ ] Used as a real example of modern open-source in NACE UC interview
