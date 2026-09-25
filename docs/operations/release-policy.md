# Release and dependency maintenance policy

This policy describes how Harly keeps dependencies and container images
maintained while the project is in beta.

## Dependency maintenance

Dependabot runs weekly for:

- the pnpm workspace and its `pnpm-lock.yaml`;
- GitHub Actions;
- the root Dockerfile.

Normal update pull requests are grouped by production and development
dependencies, limited to five open pull requests, and use a short cooldown so
newly published versions have time to receive early feedback. Major updates
remain separate for deliberate review.

Dependabot security alerts and security update pull requests are handled as
soon as a patched version is available. A dependency update is merged only
after the existing CI checks pass and the change is reviewed for runtime,
database-migration, and self-hosting impact.

## Dependency audit

CI runs `pnpm audit --audit-level=high` as an informational check. It does not
block a pull request initially because advisories can affect development-only
packages, unresolved transitive dependencies, or configurations Harly does
not use.

Dependabot Alerts remains the primary source for triaging known dependency
vulnerabilities. The audit policy can be tightened after the dependency tree
has a stable baseline and recurring false positives are understood.

## Container security

The distribution CI job scans the already-built `harly:ci` image with Trivy in
two passes:

1. HIGH and CRITICAL vulnerabilities are reported without failing the job.
2. CRITICAL vulnerabilities with an available fix fail the job.

Both passes use `ignore-unfixed: true`. This keeps images with known but
currently unpatched base-image issues visible without blocking every build,
while still blocking critical issues that can be fixed.

The release workflow scans the image **before** it is pushed. The candidate is
built for the host architecture and kept local, both Trivy passes run against
it, and only then is the multi-architecture image published. A blocking finding
keeps the image out of the registry entirely rather than leaving a published
image that the release simply does not announce. SBOM and provenance generation
remain enabled in BuildKit.

The workflow also runs the full CI suite against the tagged commit before it
builds anything. A tag that does not pass lint, typecheck, build, and tests
publishes nothing.

## Versions

Harly publishes one image per version, and only when a version tag is pushed.
Pushes to `main` run CI. They do not build or publish an image.

| Tag | Image | Who gets it |
| --- | --- | --- |
| `v0.2.0` | `ghcr.io/vytral/harly:0.2.0` and `:latest` | Everyone. This becomes the stable release. |
| `v0.2.1-beta.1` | `ghcr.io/vytral/harly:0.2.1-beta.1` | Only someone who opts in. `latest` stays put. |
| `v0.2.1-rc.1` | `ghcr.io/vytral/harly:0.2.1-rc.1` | Only someone who opts in. `latest` stays put. |

The numbers are examples. A tag has to match one of those three shapes, with a
`v` prefix. `edge`, `sha-<commit>`, and free-form names such as
`v0.1.0-beta-rc-fix-2` are not releases and are not built. A tag without the
`v`, such as `0.2.0`, is not a release either.

`latest` moves only when a stable tag is published, and it points at that
version's digest. It only ever moves forward, and which version owns it is
recomputed under a lock at the moment it is written — not decided before the
build, which would go stale while the build ran. Tagging a support patch on an
older line, or publishing two versions close together, therefore cannot drag it
backwards. After `harly update`, the installation is pinned to the digest rather
than left floating on `latest`. The command reads `release-manifest.json` on
`main`. `--to latest` selects the same stable version.

The newest stable tag updates `latest`, the manifest, `fly.toml`, `render.yaml`,
the DigitalOcean specs, and the release metadata embedded in the CLI, then
commits those files to `main`. All of that happens in one serialized job that
recomputes which version is newest at the moment it writes, so two releases
published close together converge instead of racing. A beta or release candidate
publishes the image and a GitHub prerelease, and leaves the stable channel
alone. So does a stable patch on an older line: it publishes its image and
release, but it does not touch `latest` or the manifest, because doing so would
hand every stable installation a version older than the one it already runs.
Install one of those deliberately with `--to`.

Images already published as `edge` or `sha-*` stay in GHCR until they are
deleted from the package settings. New commits do not add more of them.

## Cut a release

**The tag has to be on `main`.** The job that updates the manifest and the
deployment assets refuses to run otherwise, because it regenerates those files
from `main`'s templates and committing assets generated from a commit that was
never merged would not match what was released. Merge first, then tag.

Stable, including the first `0.2.0`:

```bash
git switch main
git pull
git tag v0.2.0
git push origin v0.2.0
```

Tag the commit you want people to run. The `v` is required. The workflow runs CI
against the tagged commit, builds `linux/amd64` and `linux/arm64`, scans the
image before publishing it, tags it as that version and as `latest`, points the
manifest at that digest, and only then opens the GitHub Release. Self-hosted
installs then run:

```bash
npx @harly/cli update
```

A discreet beta, which does not move those installs or `latest`:

```bash
git tag v0.2.1-beta.1
git push origin v0.2.1-beta.1
```

Someone who wants that build opts in:

```bash
npx @harly/cli update --to 0.2.1-beta.1
```

Before the tag: merge the intended changes into `main`, wait for CI, and write
the changelog and migration notes.

Publish `@harly/cli` when its own version changes; the image workflow does not
publish the npm package. Publish it **after** the release commit lands on
`main`, because that commit is what rewrites the release metadata embedded in
the CLI. Publishing earlier ships a package whose offline fallback still points
at the previous image:

```bash
git switch main
git pull
pnpm --filter @harly/cli test
pnpm --filter @harly/cli pack:check
pnpm --filter @harly/cli publish --access public
```

The CLI embedded in an image release is the fallback for an offline install.
Online installs and updates read the manifest.

Stable releases are planned about every two to four weeks during this phase.
Ship sooner for a security fix, a data-integrity bug, an authentication
problem, or an outage.

## Self-hosted upgrades

Operators choose when to upgrade. Harly does not update containers by itself,
and the product UI does not nag about versions.

From the installation directory, or any directory inside it:

```bash
npx @harly/cli update
```

The CLI finds `harly.config.json`, compares it with the stable manifest, and
stops if that version is already running. Otherwise it writes a rollback
archive, pulls the version, migrates, and waits until the services are
healthy. Add `--yes` when there is no terminal to confirm the prompt.

Migrations only move forward. If a migration fails after it has applied, keep
the backup from that update and restore it. Putting the previous image back is
not a rollback.

```bash
npx @harly/cli doctor
```

## Scope boundaries

Harly does not build an image per commit and does not show an in-app update
banner. `latest` is the current stable image. `harly update` is the supported
way to move an installation onto that version and pin its digest.
