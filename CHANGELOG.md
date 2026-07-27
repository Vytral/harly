# Changelog

All notable changes are documented here. Releases follow semantic versioning;
pre-releases remain explicitly tagged and `latest` is promoted only from a
passing release candidate digest.

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
