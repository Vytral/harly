# OpenHire Docs — Plan

## Current state

Does not exist. No documentation beyond the future README.

## Target state

A Mintlify (or Docusaurus) site at docs.harly.dev with:

```
Structure:
  Getting Started
    - Introduction
    - Quick start (npx @harly/cli)
    - Environment variables reference
    - First login and workspace setup

  Self-Hosting
    - Overview
    - Deploy to Railway
    - Deploy to Fly.io
    - Deploy on a VPS (Docker + Nginx)
    - Configure a custom domain for your job board
    - File storage (local disk / R2 / S3)
    - Email setup (Resend / SMTP)
    - Backups

  Configuration
    - Environment variables (full reference)
    - Workspace settings
    - Branding your job board
    - Custom application questions

  Upgrading
    - How to upgrade OpenHire
    - Changelog

  Contributing
    - How to contribute
    - Local development setup
    - Database migrations
    - Testing
    - PR guidelines
```

## Milestones

### M1 — Launch basics (Week 10)
- [ ] Set up Mintlify or Docusaurus in a separate repo (harly/harly-docs)
- [ ] Introduction page
- [ ] Quick start guide (tested end-to-end)
- [ ] Environment variables reference
- [ ] Deploy to Railway guide
- [ ] Deploy to Fly.io guide
- [ ] Deploy to VPS guide
- [ ] Contributing guide

### M2 — Post-launch depth
- [ ] All configuration pages
- [ ] Upgrade guide
- [ ] Storage setup guides (R2, S3, local)
- [ ] Email setup guide
- [ ] Custom domain guide
- [ ] Troubleshooting section

## Technical decisions

- **Mintlify** preferred: better default design, easier to maintain, free for open-source.
  Alternative: Docusaurus if Mintlify limits become a problem.
- Separate repo: harly/harly-docs — keeps docs CI independent from app CI
- Versioning: not in v1, add when breaking changes become frequent

## Open questions

- Mintlify vs Docusaurus? Mintlify looks better out of the box, Docusaurus is more
  customizable. For launch speed, Mintlify wins.
- Should docs live in the monorepo or a separate repo? Separate repo is cleaner.

## Next actions

1. Register docs.harly.dev subdomain (after domain is bought)
2. Create harly/harly-docs repo
3. Set up Mintlify with OpenHire branding
4. Write quick start guide first — it's the most important one
5. Write Railway and Fly.io deploy guides before launch
