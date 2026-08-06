# Release readiness

Use this document for every release candidate before inviting real recruiting
teams or importing candidate data. It is an evidence checklist for a specific
version, not the product roadmap.

Record the release version, image digest, environment, operator, date, and links
to test evidence in the release issue or pull request. Do not mark an item done
without a command result, screenshot, log excerpt, or linked review.

## 1. Release identity

- [ ] Choose the release version and tag; confirm the version follows the
  repository's pre-release or stable release policy.
- [ ] Update `CHANGELOG.md` with migrations, breaking changes, operator actions,
  security fixes, and known limitations.
- [ ] Publish the container image to the intended registry and record its digest.
- [ ] Update `release-manifest.json` and the generated CLI release metadata to
  point to the same image and digest.
- [ ] Confirm the release does not rely on a floating `latest` tag.
- [ ] Prepare a rollback version and confirm the operator knows where its
  backup, image, and migration notes are stored.

## 2. Clean-checkout verification

Run these checks from a clean checkout with the release environment values. Do
not use local generated files, stale build output, or production candidate data.

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm exec drizzle-kit check --config packages/db/drizzle.config.ts`
- [ ] `pnpm --filter @harly/cli test`
- [ ] `pnpm docs:validate`
- [ ] `pnpm docs:broken-links`
- [ ] `pnpm docs:a11y`
- [ ] Review the generated production image for unexpected debug routes,
  development credentials, source maps, or untracked assets.

## 3. Installation and deployment

- [ ] Install from the intended CLI package and release channel. For an
  interactive install, verify the resolved image and digest before continuing:

  ```bash
  npx -y @harly/cli
  ```

- [ ] Run `npx @harly/cli check` on the target host and record Docker, Compose,
  memory, disk, DNS, firewall, and port results.
- [ ] Confirm the deployment uses an HTTPS `HARLY_URL` with the public domain,
  not a path suffix or an internal hostname.
- [ ] Confirm PostgreSQL is persistent and uploads use persistent local storage
  or an S3-compatible bucket. Do not use ephemeral container storage for
  candidate files.
- [ ] Confirm the web app, migrator, scheduler, database, and reverse-proxy
  topology matches the selected deployment guide.
- [ ] Complete `/setup` with `HARLY_SETUP_SECRET`, then verify the expected
  owner email and invite-only registration behavior.
- [ ] Verify `/api/health/live` and `/api/health/ready` from the public URL after
  migrations finish.
- [ ] Run `npx @harly/cli doctor` after the first deployment.

## 4. Upgrade and rollback drill

- [ ] Create an off-host backup of PostgreSQL and uploads before upgrading:

  ```bash
  npx @harly/cli backup
  ```

- [ ] Test the exact upgrade command on a disposable installation:

  ```bash
  npx @harly/cli update --to <release-version>
  npx @harly/cli doctor
  ```

- [ ] Verify migrations run once, the scheduler resumes, queued work is not
  duplicated, and the health endpoint reports the new release.
- [ ] Restore the pre-upgrade backup into a disposable installation and verify
  jobs, candidates, applications, files, messages, offers, and audit history.
- [ ] Exercise the documented rollback path if the upgrade fails or readiness
  does not recover.
- [ ] For unattended automation only, pass the CLI's supported `--yes` flag;
  `-y` is the `npx` install-confirmation shorthand, not a replacement for the
  CLI's own confirmation flag.

## 5. Core recruiter smoke test

Use fictional data in a disposable workspace and capture evidence for each step.

- [ ] Create a workspace and invite a second member with a restricted role.
- [ ] Create a job with location, employment type, compensation, description,
  custom questions, and a public slug.
- [ ] Publish the job and submit an application with a supported resume format.
- [ ] Confirm the candidate, application, file, activity event, and duplicate
  detection are workspace-scoped.
- [ ] Move the application through the pipeline, record feedback, create a
  task, and verify notifications and audit history.
- [ ] Schedule an interview, verify the meeting/calendar behavior, complete or
  cancel it, and confirm provider failure leaves a retryable local record.
- [ ] Create and send an offer, complete the configured signing flow, and verify
  expiry, evidence, and withdrawal behavior.
- [ ] Close the job and confirm historical applications remain available while
  reports preserve the correct hire and funnel events.

## 6. Candidate experience and communication

- [ ] Verify the public career page, job page, application form, legal notices,
  upload limits, confirmation state, and mobile layout.
- [ ] Verify the candidate portal login, application status, interview details,
  offers, documents, and privacy export path.
- [ ] Verify sender/domain configuration before enabling candidate email.
- [ ] Test outbound mail, inbound replies, threading, attachments, bounce or
  provider failure handling, and safe retry behavior.
- [ ] Test every enabled calendar/video/signature/ATS integration with the real
  callback URL and signature secret for the release environment.
- [ ] Test webhook delivery, retry, replay, idempotency, and secret rotation
  against a controlled endpoint.

## 7. Security and privacy gate

- [ ] Generate unique production values for `BETTER_AUTH_SECRET`,
  `AI_ENCRYPTION_KEY`, `STORAGE_UPLOAD_SECRET`, `CRON_SECRET`, and
  `HARLY_SETUP_SECRET`.
- [ ] Confirm `.env`, provider tokens, database URLs, setup secrets, and backup
  archives are not committed, logged, or exposed in client responses.
- [ ] Restrict access to deployment files and backups to the operator and the
  minimum required service accounts.
- [ ] Test built-in and custom roles against both the UI and API, including
  cross-workspace access attempts.
- [ ] Test MFA/passkeys, SSO domain verification, SCIM create/update/deactivate,
  API-key scopes and rotation, webhook secret rotation, and device-session
  revocation when enabled.
- [ ] Review retention, consent, legal notices, candidate export, deletion or
  anonymization, audit-log access, and private file download behavior with the
  organization responsible for the data.
- [ ] Confirm the security review has no unresolved critical or high-severity
  issue, or record an explicit risk acceptance before release.

## 8. Operational handoff

- [ ] Name the owner for upgrades, secret rotation, backup verification,
  incident response, and vulnerability reports.
- [ ] Configure a recurring scheduler or the bundled scheduler and verify cron
  authentication and failure alerting.
- [ ] Configure off-host backup storage, retention, encryption, and a recurring
  restore drill.
- [ ] Configure logs, metrics, uptime checks, disk alerts, database health, and
  provider failure visibility appropriate for the deployment size.
- [ ] Publish the operator links: [self-hosting](self-hosting.md),
  [backups](backups.md), [configuration](configuration.md),
  [troubleshooting](https://docs.harly.dev/operations/troubleshooting), and
  [security reporting](../SECURITY.md).
- [ ] Confirm the support/contact path, known limitations, and release notes are
  available to the people operating the installation.

## Go / no-go decision

Release only when all of the following are true:

- CI, build, migration, documentation, and CLI checks pass from a clean
  checkout.
- The exact image digest has passed install, health, smoke, upgrade, backup,
  and restore verification.
- Candidate files and database data have a proven recovery path.
- Security, privacy, permissions, and provider callback tests are complete.
- Every remaining issue is low risk, documented, assigned, and acceptable to
  the operator responsible for the deployment.

Do not release when a critical/high security issue is unresolved, readiness is
not recoverable, backups have not been restored successfully, candidate files
are ephemeral, or the release artifact cannot be tied to a known digest.
