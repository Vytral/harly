# Changelog

All notable changes are documented here. Releases follow semantic versioning;
pre-releases remain explicitly tagged and `latest` is promoted only from a
passing release candidate digest.

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
