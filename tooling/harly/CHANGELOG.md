# Changelog

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
