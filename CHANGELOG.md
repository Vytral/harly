# Changelog

All notable changes to Harly are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning

A Harly version is `MAJOR.MINOR.PATCH`. The git tag is that version with a
`v` prefix. `v0.2.0` publishes a release. `0.2.0`, without the `v`, does not.

| Change | Bump | Tag | Who receives it |
| --- | --- | --- | --- |
| Incompatible change after 1.0.0 | Major | `v1.0.0` | Everyone. Also moves `ghcr.io/vytral/harly:latest`. |
| New feature. Before 1.0.0 this may include incompatible changes | Minor | `v0.3.0` | Everyone. Also moves `latest`. |
| Compatible fix | Patch | `v0.2.1` | Everyone. Also moves `latest`. |
| Opt-in preview | Prerelease | `v0.3.0-beta.1` | Only `harly update --to 0.3.0-beta.1`. Does not move `latest`. |
| Opt-in preview, closer to stable | Prerelease | `v0.3.0-rc.1` | Only `harly update --to 0.3.0-rc.1`. Does not move `latest`. |

`0.3.0` above is the shape of a version, not a scheduled release. Use the
number you are actually shipping.

`ghcr.io/vytral/harly:latest` is the newest stable image. It is the same
digest as the version tag it was published with. A beta or release candidate
does not move it. `npx @harly/cli update` and `--to latest` both install that
stable version and pin its digest.

Pushing commits to `main` runs CI. It does not build an image, move `latest`,
or change the release manifest.

Before tagging, write the version section below. Use these headings when they
apply: `Added`, `Changed`, `Fixed`, `Removed`, `Security`. Note migrations and
anything an operator must do before upgrading.

## [0.2.0]

The public demo, a deterministic candidate evaluator, a rebuilt automation
runtime, and native multi-signer e-sign. This release adds nine migrations, four
of which rewrite existing rows — read "Upgrading" at the end of this section
before you start.

### Added

#### Demo

- A public demo built on a preconfigured Syntrix workspace, entered through a
  new `/enter` flow, seeded with jobs, candidates, activity, branding, and
  career page configuration.
- Demo lockdown: sensitive mutations are refused, external egress becomes a
  no-op so nothing reaches a real provider, and a reset flow restores the
  workspace to its intended state.
- Demo-aware navigation, session handling, and a one-per-browser notice in the
  Dynamic Island.

#### Harly Algorithm v4

- A deterministic candidate evaluation engine that scores candidates against
  job requirements and structured criteria without calling an AI provider. The
  same candidate and criteria produce the same result.
- Structured scorecards with criterion-level results and supporting evidence,
  knockout criteria, evaluation gates, and snapshot metadata that preserves the
  context each evaluation used.
- Wired into application auto-scoring and the existing evaluation workflows.

#### Automations

- A new workflow runtime: run admission, scheduling, execution policies, leases,
  due-run handling, simulation, permissions, and run recovery.
- Cron and webhook triggers, with a dedicated webhook ingress for workflows.
- Workflow definition and versioning, plan compilation, and resource resolution.
- Anti-loop protection and run admission controls.
- Pending approvals and approval policies.
- A far larger builder: validation, workflow outline, dry runs, run timelines,
  save states, and additional editing tools.
- Harly AI automation proposals.

#### Documents and native e-sign

- Document template management and editing, and document generation from
  workflows.
- Document actions inside Automations, with signature recipient configuration
  for automated workflows.
- Native multi-signer signing, vector signatures, saved signature improvements,
  and better field placement and PDF rendering.
- Candidate-facing and public signing flows, signing reminders, and document
  expiration handling.

### Changed

- Stable version tags publish `ghcr.io/vytral/harly:<version>` and move
  `ghcr.io/vytral/harly:latest` to that same digest. Prerelease tags publish
  only their own version tag.
- Pushes to `main` no longer publish an image.
- `:latest` and the release manifest that `harly update` reads only ever move
  forward, and which version owns them is recomputed under a lock at the moment
  they are written. Deciding it before the image build left a stale answer that
  a 40-minute build could invalidate, so two releases tagged close together
  could settle on the older one. Tagging a support patch on an older line leaves
  both untouched; install it with `--to`.
- The container image is built and scanned before it is pushed. A blocking
  vulnerability now keeps the image out of the registry instead of only
  skipping the release that announces it.
- The tagged commit is linted, typechecked, built, and tested before anything
  is published. Tags previously bypassed CI entirely.
- The GitHub Release is published after the release manifest lands on `main`,
  so the notes never tell an operator to run `harly update` for a version the
  manifest cannot yet serve.
- Database connections are bounded and time-limited. The pool defaults to 10
  connections per process, drops idle connections after 30s, fails fast after
  10s when the database is unreachable, and recycles connections every 30
  minutes. Override with `HARLY_DB_POOL_MAX`, `HARLY_DB_IDLE_TIMEOUT`,
  `HARLY_DB_CONNECT_TIMEOUT`, and `HARLY_DB_MAX_LIFETIME`. A small managed
  Postgres plan previously ran out of connections with no way to size the pool.
- Upgraded `next` to `16.3.5` and `sharp` to `0.35.4`. A production dependency
  audit no longer reports the high and critical findings it did before.

### Fixed

- Migrations take a Postgres advisory lock. Two instances migrating at once —
  a rolling deploy, an init container per replica, or an overlapping redeploy —
  previously ran the same DDL concurrently with no coordination. The second
  process now waits, applies nothing, and exits cleanly.
- Passkey login issues a usable session. The route wrote the raw session token
  into the cookie, but Better Auth only accepts a signed one, so a successful
  WebAuthn assertion still landed back on the login page.
- `db:verify-migrations` accepts migrations that have not been applied yet. It
  required the journal and the database to match exactly, which made the
  prescribed pre-upgrade check fail precisely when there was something to
  upgrade. The applied history is still verified hash by hash, and a database
  ahead of the checkout is still an error.
- Magic-link login is only offered when it can actually deliver. An SMTP host
  without a port advertised the method while the mail transport refused to
  build, leaving a workspace that allows only magic link with no way in.
- The release workflow can publish its GitHub Release at all. It ran `gh`
  without a checkout and without `GH_REPO`, so every release would have failed
  to resolve the repository.
- The release commit is rebased and retried if `main` moved while the image was
  building. A single rejected push previously left the image published and the
  manifest stale, which pinned `harly update` to the previous version.
- The release refuses to sync deployment assets when the tag is not on `main`,
  rather than generating them from templates that were never released.
- The `.next` build cache is no longer shared between architectures in a
  multi-platform build, which mixed amd64 and arm64 artifacts in one cache.
- Auth submit buttons and the AI provider tool adapter no longer break
  `tsc --noEmit`.

### Security

- Demo mode cannot mutate sensitive state or reach an external provider.
- Automation effects are gated behind workspace pause, and reservations and
  provider capacity are claimed atomically.
- Workflow approval requires an independent approver.

### Upgrading

This release adds nine migrations, `0143` through `0151`. Four of them change
existing rows, so **take a backup first** — `harly update` writes one before it
starts.

- `0143` deletes duplicate `member` rows before adding a unique index on
  `(organization_id, user_id)`. It keeps `status = 'active'` first, then the most
  recently updated. A workspace where the same user was somehow a member twice
  with different roles keeps one of them.
- `0144` withdraws duplicate draft and sent offers for the same application, and
  deletes duplicate `scorecards`, keeping the newest per
  `(workspace, application, author, stage)`. If two evaluators' rows collapsed
  into one tuple, the older scorecard and its comments are gone.
- `0144` and `0149` then add partial unique indexes on `offers`, `applications`,
  `candidates`, and `scorecards`. If existing data still violates them after the
  deduplication above, the migration fails and the whole upgrade rolls back —
  nothing is half-applied, but the upgrade does not complete.
- `0150` adds the refund receipt table, which the automation cleanup now prunes.

If you are coming from the published `0.1.0-beta.2` image rather than from
`main`, you also pick up everything between `0069` and `0142`. That range
includes `0097`, which removes the DocuSign integration: the
`docusign_webhook_events` table, every stored DocuSign credential, and
`offers.docusign_envelope_id`. Native e-sign replaces it. Export what you need
before upgrading.

Migrations run in a single transaction, so a failure rolls back cleanly, but the
upgrade holds locks until it commits. On managed Postgres, check that
`statement_timeout` and `idle_in_transaction_session_timeout` are high enough to
let it finish.

## @harly/cli 0.5.0

### Added

- `harly update` finds the installation from the current directory and upgrades
  it to the stable version in `release-manifest.json`. No version flag and no
  directory argument are required when you run it from the install, or from a
  folder inside it.
- `--to latest` is the same stable update. The installation is pinned to that
  version's digest.

### Changed

- An update that is already on the stable version stops before writing a
  backup or pulling an image.
- An update refuses to downgrade a newer install unless `--to` names the
  version on purpose.
- `edge` and `sha-…` tags are rejected. A release version is `0.2.0`,
  `0.2.0-beta.1`, `0.2.0-rc.1`, or the official image digest.
- `--image` accepts a private registry or mirror again, which an air-gapped
  install needs. The official repository still only accepts a release version
  or a digest; any other registry only has to name an explicit tag or digest.
- `--image 0.2.0` means the official image at that version, so `--image` and
  `--to` now accept the same bare version instead of disagreeing.

### Fixed

- The stable channel refuses to install a prerelease. Betas stayed opt-in only
  because of a workflow condition; if a prerelease ever reached the release
  manifest, `harly update` would have installed it as though it were stable.
- A failed upgrade no longer leaves the installation pointing at the new image
  with the old services running. The recovery path is `harly restore` from the
  archive the upgrade writes first, and the error says so.
- `.env` no longer records the literal `current` as `HARLY_VERSION` while an
  upgrade is in flight, which the application reported as its own version.


## @harly/cli 0.4.0

- Report the running deployment by release name instead of a 64-character
  digest. `harly` resolves the friendliest honest label available — a semver
  tag, a digest that matches the published release manifest, or the
  `org.opencontainers.image.version` and `.revision` labels CI bakes into every
  image — and degrades to a short digest only when nothing else is known. A
  moving channel is reported with its build commit (`edge · cd78e8e`) so two
  `edge` deployments can be told apart.
- Record a resolved release name in `HARLY_VERSION` at install and upgrade time.
  A digest-pinned installation previously wrote the literal string `digest`,
  which the application then reported as its own version at
  `/api/health/ready` and in its OpenAPI document.
- Split the rollback backup out of `harly update` into its own reported phase.
  The upgrade now renders as four numbered steps (rollback point, images,
  migrations, health) and names the archive it wrote, instead of running the
  backup silently and printing a bare path mid-flow.
- Keep the interactive vertical rail unbroken. `doctor`, `backup`, `launch`,
  `uninstall`, and the install outro wrote directly to stdout inside a prompt
  flow, which severed the rail and left output floating unindented; the setup
  secret block was the worst affected. Automation output is unchanged: `--json`
  and non-interactive runs still carry the machine check keys, and
  `harly backup` still prints the bare archive path for `$(harly backup)`.
- Group `doctor` checks with per-domain glyphs and an aligned detail column, and
  drop the internal check keys (`service:postgres`, `readiness`) from the
  interactive render. They remain in `--json` and non-interactive output.
- Report download rate and active layers while pulling images. Layer counts
  stay the progress measure because Docker never reports a layer's total size,
  so a byte percentage would be fiction.
- Add `HARLY_ASCII=1` for terminals without box-drawing glyph coverage.

## @harly/cli 0.3.1

- Treat restricted `EACCES`/`EPERM` port probes as inconclusive so the CLI can
  continue in constrained runners and let Docker perform the authoritative
  publish check.
- Polish the interactive installer summaries, progress labels, and compact
  branding for narrow SSH sessions.
- Make CLI tests resilient to shared ports and ANSI-formatted dry-run output.

## @harly/cli 0.4.0

- Report the running deployment by release name instead of a 64-character
  digest. `harly` resolves the friendliest honest label available — a semver
  tag, a digest that matches the published release manifest, or the
  `org.opencontainers.image.version` and `.revision` labels CI bakes into every
  image — and degrades to a short digest only when nothing else is known. A
  moving channel is reported with its build commit (`edge · cd78e8e`) so two
  `edge` deployments can be told apart.
- Record a resolved release name in `HARLY_VERSION` at install and upgrade time.
  A digest-pinned installation previously wrote the literal string `digest`,
  which the application then reported as its own version at
  `/api/health/ready` and in its OpenAPI document.
- Split the rollback backup out of `harly update` into its own reported phase.
  The upgrade now renders as four numbered steps (rollback point, images,
  migrations, health) and names the archive it wrote, instead of running the
  backup silently and printing a bare path mid-flow.
- Keep the interactive vertical rail unbroken. `doctor`, `backup`, `launch`,
  `uninstall`, and the install outro wrote directly to stdout inside a prompt
  flow, which severed the rail and left output floating unindented; the setup
  secret block was the worst affected. Automation output is unchanged: `--json`
  and non-interactive runs still carry the machine check keys, and
  `harly backup` still prints the bare archive path for `$(harly backup)`.
- Group `doctor` checks with per-domain glyphs and an aligned detail column, and
  drop the internal check keys (`service:postgres`, `readiness`) from the
  interactive render. They remain in `--json` and non-interactive output.
- Report download rate and active layers while pulling images. Layer counts
  stay the progress measure because Docker never reports a layer's total size,
  so a byte percentage would be fiction.
- Add `HARLY_ASCII=1` for terminals without box-drawing glyph coverage.

## @harly/cli 0.3.1

- Treat restricted `EACCES`/`EPERM` port probes as inconclusive so the CLI can
  continue in constrained runners and let Docker perform the authoritative
  publish check.
- Polish the interactive installer summaries, progress labels, and compact
  branding for narrow SSH sessions.
- Make CLI tests resilient to shared ports and ANSI-formatted dry-run output.

## @harly/cli 0.3.0

- New `harly check` command that prints a host requirements table (Docker
  version, Compose, free memory, free disk, firewall) without touching the
  install. Useful for "is my VPS ready?" before running the wizard.
- New `harly setup-secret` command that prints `HARLY_SETUP_SECRET` from
  `.env` so operators can finish `/setup` without opening the file.
- New `harly init --dry-run` flag that lists the files that would be created
  without writing anything.
- New `harly doctor --fix` flag that offers to restart stopped services or
  bring the stack up when interactive.
- Demoted managed-cloud providers (Railway, Fly.io, DigitalOcean) from the
  welcome menu to a discoverable `harly deploy <provider>` subcommand. The
  welcome menu is now `Install / Deploy to a managed cloud / Show advanced
  commands`.
- Port-conflict errors are now actionable: the CLI classifies the owner
  (systemd unit, container, raw process) and offers to stop it, switch to
  external-proxy mode, or pick a different port. In CI it prints the exact
  command to fix it instead of "port already in use".
- DNS failures in interactive mode run a 5-minute wait-and-retry loop so
  propagation can finish on its own.
- `launch` now polls each service individually and reports per-service timing
  (`✓ postgres ready · 8.2s`, `✓ migrate applied · 1.4s`, `✓ app ready · 14.1s`,
  …) plus a public-URL smoke test at the end.
- `init` prints the install outro with the setup secret copy-pasted, so the
  `/setup` flow is one read-and-paste away.
- Resource profile detection now uses `os.freemem()` minus Harly's known
  reservations instead of `os.totalmem()`, so a VPS that already runs other
  services isn't mis-sized.
- Added a `ufw` firewall check that warns when 80/443 are not allowed on
  active firewalls (cloud security groups, transparent proxies, and
  no-firewall VPS providers remain valid configurations).
- Removed the duplicate "Welcome to Harly" `p.intro` inside the install flow
  — `showBrand` is the single branding surface.

## @harly/cli 0.2.4

- Redesigned the CLI around the Harly palette: the full mark renders once per
  session and later screens use a compact wordmark, replacing the cyan styling
  that repeated the logo on every surface.
- Streamed `docker compose pull` instead of buffering it, so a cold install
  reports live per-layer progress rather than freezing a spinner for minutes.
- Rewrote `doctor` output in plain language and stylised `harly --help`.
  The `--json` keys and exit codes are unchanged.

## 0.1.0-beta.1 — unreleased

- Added shared fail-fast runtime configuration and canonical `HARLY_URL`.
- Added protected singleton first-owner bootstrap.
- Added standalone image commands, production Compose topology, scheduler, and
  Caddy profile.
- Added durable queue leases, PostgreSQL advisory locks, and opaque health
  probes.
- Added `@harly/cli` init, launch, doctor, backup, restore, and upgrade
  commands.
