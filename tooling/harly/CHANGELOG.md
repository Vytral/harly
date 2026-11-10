# Changelog

## 0.7.0 — 2026-11-07

### Telemetry (opt-in)

- `harly init` asks once, in an interactive terminal, whether to share anonymous
  usage data. The default is no. If you agree, it can also ask how you heard
  about Harly. The payload is a random instance id, the CLI version, the OS and
  architecture, the deployment mode and the optional answer. It never includes
  your domain, email, organization name or IP address.
- Turn it off with `--no-telemetry`, `HARLY_TELEMETRY=0` or `DO_NOT_TRACK=1`;
  these win over a saved "yes". Non-interactive runs send nothing unless you pass
  `--telemetry` or set `HARLY_TELEMETRY=1`.
- `harly telemetry status | enable | disable` manages the saved choice. The
  endpoint can be changed with `HARLY_TELEMETRY_URL`. The payload contract is in
  the README.

### Fixed

- The commands printed at the end of `harly init` and in the generated README
  said `npx @harly/cli` even when the CLI was installed globally. Every hint now
  names the command you actually used, and says `harly` after you accept the
  global install. `init` offers the global install before the final summary.

### Added

- `harly init` writes `HARLY_ORG_NAME` to `.env`, so the setup wizard does not
  ask for the company name again.

## 0.6.0 — 2026-10-31

### A more guided CLI

- Added `harly status`: URL, version against the latest release, container
  health, database, free disk, last backup, and certificate expiry on one
  screen, with next steps. `--json` returns the same data and the command exits
  `1` when a service or the public endpoint is down. `doctor` is unchanged.
- `harly --help` groups commands by purpose, hides flag tails from the overview,
  and adds global options and examples. `harly help <command>` and
  `harly <command> --help` list a command's options and examples. `--json help`
  keeps `commands` and adds `groups`.
- The interactive menu shows version, update availability, and last backup, and
  adds "Check this server first", "Show setup secret", and "Show all commands".
  Restore now names the newest archive and the exact restore command.
- Mistyped commands and options suggest the closest match (`harly docter` ->
  `Did you mean harly doctor?`) and an unknown command no longer prints the whole
  help. Failures end with next steps (also under `next` in `--json`); `--verbose`
  adds the stack for unexpected errors.
- `--quiet` is now honoured: it hides the header, hints, and update notices.
  `--no-color`/`NO_COLOR` apply everywhere.
- The header notes an available CLI update, checked at most once a day. Disable
  it with `HARLY_NO_UPDATE_CHECK=1`; it never runs in CI, pipes, or `--json`.

### Updater

- Added `harly updater run | install-service | status`, the host-side half of
  Settings → Updates in the app. The updater polls the instance for owner-
  requested and scheduled updates, runs `harly update`, rolls back to the
  pre-update backup if the update fails after changing the install, and reports
  the outcome. It authenticates with a token derived from `CRON_SECRET`.
  `--once` and `--interval <seconds>` are new options.
- The updater installs the exact image digest it verified against the stable
  channel, so a release published mid-update is never installed in its place.
- `harly update` keeps `app` and `scheduler` stopped from the rollback backup
  until the new release starts, so a rollback never discards work accepted in
  between. If anything fails before migrations start, `.env` is put back and
  the previous release starts again. `harly restore` likewise keeps them
  stopped from its safety backup until the restore finishes.
- `harly update` refuses a pulled release tag whose digest differs from the
  one the release manifest publishes, before running any migration.

### Global install

- Added `harly install-global` (`--yes` for scripts, `--dry-run` to preview).
- The npx offer is now asked once, in plain language, defaulting to yes, at the
  start of the interactive menu as well as after install, launch, and resume.
  After installing it verifies that `harly` resolves and, when npm's global bin
  directory is missing from PATH, prints the exact command for zsh, bash, fish,
  or PowerShell.
- A declined offer is remembered in `config.json` under `$XDG_CONFIG_HOME/harly`
  (default `~/.config/harly`) or `%APPDATA%\harly`; `HARLY_CONFIG_DIR` overrides
  it. `--yes` still never accepts the offer implicitly.

## 0.5.2 — 2026-09-27

- Added `harly resume` and a guided menu action to retry startup with saved
  configuration and secrets. The installer detects existing configuration
  before asking for inputs again, and failures show the command to retry.
- Caddy readiness uses the public endpoint after the app is healthy instead
  of requiring a Docker healthcheck. Automatic HTTPS can take up to 15 minutes;
  `launch` and `resume` accept `--timeout <seconds>` to override service waits.
- HTTPS progress includes elapsed time and the latest connection or HTTP status.
  A timeout includes the command to inspect Caddy logs and DNS/port guidance.
- Successful interactive installs, launches, and resumes through npx offer to
  install the CLI globally. This requires a separate confirmation; declining,
  cancellation, or npm failures keep the Harly deployment successful.

## 0.5.1 — 2026-09-25

### First-install experience

- The guided installer checks Node.js, Docker, Compose, disk, and RAM before
  asking for a domain or proxy mode. It checks ports and DNS after those choices.
- Unsupported Node.js versions now receive a clear requirement and Quickstart
  link before the interactive dependencies load.
- Installer guidance links to docs.harly.dev instead of the repository guide.
- Generated Compose files quote tmpfs options for the app and scheduler so YAML
  keeps `mode=1777` in the mount options instead of treating it as another path.

## 0.5.0 — 2026-09-25

### Stable release updates

- `harly update` now follows the stable release manifest by default and pins
  the deployment to the published image digest. `--to latest` selects the same
  stable channel; `--to <version>` selects a numbered release explicitly.
- Stable updates refuse to downgrade a newer installation and exit without
  pulling or restarting when the install already matches the current release.
- The installer accepts `latest` as a channel alias and resolves it to the
  current stable digest. It rejects `edge` and commit-build tags for the
  official Harly image.

### Image and recovery reporting

- Version display resolves numbered tags, manifest-matched digests, and OCI
  image labels in order of certainty, with a short digest as the fallback.
- Updates keep the target image configured after migrations begin, so recovery
  does not point a migrated database back at the previous image. The error
  reports the local safety backup to restore if the update fails.
- Installation discovery works from nested directories, and the CLI reports
  when no installation can be found instead of treating the current directory
  as one.

## 0.4.0

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

## 0.3.1

- Treat restricted `EACCES`/`EPERM` port probes as inconclusive so the CLI can
  continue in constrained runners and let Docker perform the authoritative
  publish check.
- Polish the interactive installer summaries, progress labels, and compact
  branding for narrow SSH sessions.
- Make CLI tests resilient to shared ports and ANSI-formatted dry-run output.

## 0.3.0

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

## 0.2.4

- Redesigned the CLI around the Harly palette: the full mark renders once per
  session and later screens use a compact wordmark, replacing the cyan styling
  that repeated the logo on every surface.
- Streamed `docker compose pull` instead of buffering it, so a cold install
  reports live per-layer progress rather than freezing a spinner for minutes.
- Rewrote `doctor` output in plain language and stylised `harly --help`.
  The `--json` keys and exit codes are unchanged.

## 0.1.0

- Added shared fail-fast runtime configuration and canonical `HARLY_URL`.
- Added protected singleton first-owner bootstrap.
- Added standalone image commands, production Compose topology, scheduler, and
  Caddy profile.
- Added durable queue leases, PostgreSQL advisory locks, and opaque health
  probes.
- Added `@harly/cli` init, launch, doctor, backup, restore, and upgrade
  commands.
