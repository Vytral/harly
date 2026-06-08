# create-harly — Plan

## Current state

Does not exist. No CLI, no package, no wizard.

## Target state

A published npm package `@harly/create` that:

1. Runs a wizard with these steps:
   ```
   ? What's your organization name? Acme Corp
   ? What domain will you use? hiring.acme.com
   ? PostgreSQL connection string? postgres://...
   ? Storage provider? (local / R2 / S3)
   ? [if R2/S3] Bucket name and credentials?
   ? Email provider? (Resend / SMTP / skip)
   ? [if Resend] API key?
   ? Auth providers? (Google / magic link / both)
   ? [if Google] OAuth client ID and secret?
   ```

2. Validates each input where possible (ping DB, test bucket access)

3. Generates a `.env` file ready to use

4. Prints a final summary:
   ```
   ✓ .env generated
   
   Next steps:
   1. Copy .env to your server
   2. Run: docker compose up -d
   3. Visit https://hiring.acme.com to complete setup
   
   Deploy guides: docs.harly.dev/self-hosting
   ```

## Milestones

### M1 — MVP CLI (Week 8–9)
- [ ] Create `packages/create-harly` in monorepo (or separate repo)
- [ ] Set up as a bin package with `#!/usr/bin/env node`
- [ ] Implement wizard with `@clack/prompts` (best DX for interactive CLIs)
- [ ] Generate `.env` file from wizard answers
- [ ] Basic validation: test DB connection before proceeding
- [ ] Print next steps based on detected or chosen deploy target
- [ ] Publish to npm as `@harly/create`

### M2 — Upgrade command (post-launch)
- [ ] `npx @harly/create upgrade` — checks current version vs latest, runs migrations
- [ ] Changelogs shown inline during upgrade

### M3 — Smarter detection (post-launch)
- [ ] Detect Railway/Fly.io env variables automatically
- [ ] Pre-fill wizard answers from existing `.env` if found
- [ ] Validate all credentials before generating .env

## Technical decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| CLI framework | `@clack/prompts` | Best terminal UX, actively maintained |
| Validation | `zod` | Already in the project, consistent |
— DB test | `pg` direct connect | Lightweight, no ORM needed for just a ping |
| Package | ESM, Node 18+ | Modern, no CJS compatibility headaches |

## Wizard flow (detailed)

```
┌ Welcome to Harly setup
│
├ Organization
│  └ name → used as default workspace name
│
├ Deployment
│  └ domain → added to .env as NEXT_PUBLIC_URL
│
├ Database
│  └ connection string → tested, added as DATABASE_URL
│
├ Storage
│  ├ local disk (dev only, not recommended for production)
│  ├ Cloudflare R2 → account ID, access key, secret, bucket
│  └ Amazon S3 → region, access key, secret, bucket
│
├ Email
│  ├ Resend → API key, sender address
│  ├ SMTP → host, port, user, pass, sender
│  └ skip (magic link and notifications won't work)
│
├ Auth
│  ├ Google OAuth → client ID, client secret
│  ├ Magic link (requires email to be configured)
│  └ both
│
└ Done → writes .env, prints next steps
```

## Open questions

- Should the CLI clone the repo or just generate the .env?
  - Option A: just .env generation — user already has the repo
  - Option B: full bootstrap — clone repo + install deps + generate .env
  - Decision: start with Option A (simpler), add B in M2

- Should we validate R2/S3 credentials by actually uploading a test file?
  - Yes, if we can do it without side effects (delete the test file after)

## Next actions

1. This is a Week 8–9 task — do not start before core is working
2. Set up `packages/create-harly` directory with package.json and bin entry
3. Implement the wizard step by step, testing each prompt
4. Publish to npm (even as 0.1.0-beta) before Product Hunt launch
