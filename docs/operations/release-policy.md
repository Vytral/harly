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

The release workflow applies the same checks to the image digest it builds and
publishes. SBOM and provenance generation remain enabled in BuildKit.

## Image channels

Harly currently has two practical image references:

- `edge`: built from `main` and intended for previews or testing;
- an exact SemVer tag, such as `0.1.0-beta.2`, for a reproducible release.

Harly does not publish a floating `latest` tag. Production and self-hosted
deployments must use an exact version or digest:

```dotenv
HARLY_IMAGE=ghcr.io/vytral/harly:0.1.0-beta.2
```

For the strongest reproducibility, use the digest recorded in
`release-manifest.json`:

```dotenv
HARLY_IMAGE=ghcr.io/vytral/harly@sha256:<release-digest>
```

Do not use `edge` for an installation that requires a predictable upgrade
surface. The CLI rejects `latest` intentionally.

## Release cadence

Stable releases are planned approximately every two to four weeks while Harly
is in beta. A release may happen sooner for a critical security fix, serious
data-integrity issue, authentication problem, or production-blocking bug.

Before creating a release tag:

1. merge the intended changes into `main`;
2. wait for CI to pass;
3. review the changelog and migration impact;
4. create a SemVer Git tag such as `v0.1.0-beta.3`;
5. verify the published image, digest, release manifest, and deployment assets;
6. communicate the upgrade notes and rollback expectations.

The release workflow publishes the exact SemVer image tag and a commit SHA
tag. The release manifest records the official version and immutable digest
used by the CLI and managed deployment assets.

## Self-hosted upgrades

Self-hosted operators choose when to upgrade. Harly does not update containers
automatically.

Before an upgrade:

```bash
npx @harly/cli backup /opt/harly
npx @harly/cli doctor /opt/harly
```

Upgrade to an explicit version:

```bash
npx @harly/cli update /opt/harly --to 0.1.0-beta.2 --yes
```

Afterward, verify readiness and service health:

```bash
npx @harly/cli doctor /opt/harly
docker compose ps
```

If a migration or deployment fails, keep the backup created before the
upgrade and follow the restore procedure in the self-hosting operations guide.

## Scope boundaries

This policy intentionally does not introduce a `stable` tag, an in-panel
version notification, or an automatic updater. The CLI is the supported update
mechanism for now. Those features can be evaluated once Harly has several
stable releases and real self-hosting usage data.
