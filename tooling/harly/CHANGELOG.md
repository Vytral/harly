# Changelog

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
