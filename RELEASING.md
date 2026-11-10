# Releasing Harly

This is the checklist for cutting a release. The policy behind it (dependency
updates, image scanning, how `latest` moves) is in
[docs/operations/release-policy.md](docs/operations/release-policy.md).

Harly ships two things with separate version numbers:

| What | Version lives in | Changelog | Tag | Published by |
| --- | --- | --- | --- | --- |
| The app (container image) | `package.json`, `apps/web/package.json` | [CHANGELOG.md](CHANGELOG.md) | `v0.4.0` | `release-image.yml` |
| The CLI, `@harly/cli` | `tooling/harly/package.json` | [tooling/harly/CHANGELOG.md](tooling/harly/CHANGELOG.md) | `cli-v0.7.0` (created by the workflow) | `publish-cli.yml` |

Internal workspace packages (`@harly/db`, `@harly/ui`, …) are private and stay
at `0.1.0`. Do not bump them.

## Versions

`MAJOR.MINOR.PATCH`, following [Semantic Versioning](https://semver.org).
Before 1.0.0 a minor release may contain breaking changes; say so in its notes.

| Change | Example tag | Who receives it |
| --- | --- | --- |
| New features, or a breaking change before 1.0 | `v0.5.0` | Everyone. Moves `ghcr.io/vytral/harly:latest`. |
| Compatible fixes | `v0.4.1` | Everyone. Moves `latest`. |
| Opt-in preview | `v0.5.0-beta.1` | Only `harly update --to 0.5.0-beta.1`. |
| Release candidate | `v0.5.0-rc.1` | Only `harly update --to 0.5.0-rc.1`. |

Any other tag shape (`0.4.0` without the `v`, `v0.4.0-fix`, `edge`) is refused
by the workflow and publishes nothing.

## The changelog is the release notes

Every change that an operator, recruiter, candidate or API user would notice
gets a bullet under `## [Unreleased]` in `CHANGELOG.md`, in the same pull
request as the change. Use the Keep a Changelog headings `Added`, `Changed`,
`Fixed`, `Removed`, `Security`, and say plainly what someone has to do: run
migrations, set a variable, re-authorize a client.

At release time the `[Unreleased]` section is renamed to the version. The
release workflow copies that section verbatim into the GitHub Release, so
GitHub, the changelog and `harly status` always agree. A stable tag without a
section fails in the first minute, before anything is built. A prerelease uses
its own section if there is one and `[Unreleased]` otherwise.

The CLI works the same way with `tooling/harly/CHANGELOG.md` and headings like
`## 0.8.0 — 2026-11-20`.

## Cut an app release

1. **Prepare a release pull request** against `main`, titled
   `chore(release): prepare 0.5.0`:
   - In `CHANGELOG.md`, rename `## [Unreleased]` to `## [0.5.0] - YYYY-MM-DD`,
     add a fresh empty `## [Unreleased]` above it, open the section with one or
     two sentences on what the release is for and its migrations, and add the
     `[0.5.0]:` link at the bottom (update the `[Unreleased]:` compare link).
   - Set `"version": "0.5.0"` in `package.json` and `apps/web/package.json`.
   - If the CLI changed, bump `tooling/harly/package.json` and add its
     changelog section too (see below).
   - `node --test tooling/scripts/*.test.mjs` checks that every version you set
     has a section.
2. **Merge it** once CI is green. The tag must point at a commit on `main`.
3. **Tag and push:**

   ```bash
   git switch main && git pull
   git tag -a v0.5.0 -m "Harly 0.5.0"
   git push origin v0.5.0
   ```

4. **Watch "Release container image"** in Actions. It runs the full CI suite on
   the tag, builds amd64 and arm64, scans both with Trivy, publishes the image,
   commits the release manifest and deployment files to `main` as
   `chore(release): publish 0.5.0 [skip ci]`, and finally publishes the GitHub
   Release with the changelog section as its body.
5. **Check the result:** the GitHub Release text, `harly update` on a test
   install, and that **Publish CLI** ran if the CLI version changed.

For a prerelease, skip the changelog rename (or add a `## [0.5.0-beta.1]`
section if you want notes specific to it) and tag `v0.5.0-beta.1`.

## Cut a CLI release

The CLI is published to npm through Trusted Publishing, with no token.

- **Together with an app release:** bump `tooling/harly/package.json`, write its
  changelog section, and merge both in the release pull request. Publish CLI
  runs automatically after the image workflow succeeds for a stable tag.
- **CLI only:** merge the bump and changelog, then run **Publish CLI** from the
  Actions tab.

The workflow skips a version that is already on npm, sends prereleases to the
`next` dist-tag, and creates the `cli-vX.Y.Z` tag and GitHub Release (never
marked Latest) from the changelog section.

## If something goes wrong

- **The workflow failed before publishing.** Nothing was announced. Fix it on
  `main`, delete the tag (`git push origin :refs/tags/v0.5.0` and
  `git tag -d v0.5.0`) and tag again.
- **A broken version is already published.** Do not move or reuse the tag.
  Ship the fix as the next patch version.
- **Wrong release notes.** Fix `CHANGELOG.md` on `main` and edit the GitHub
  Release text to match.
