import { run } from "./shell.js";
import { embeddedRelease, type HarlyRelease } from "./release.js";

/**
 * A deployed image, described the way an operator thinks about it.
 *
 * `harly.config.json` pins a digest, because a digest is the only reference
 * that cannot silently change under a running deployment. That makes it the
 * right thing to *store* and the wrong thing to *show*: nobody reads
 * `sha256:91935a0b…` and learns which Harly they are running.
 */
export type ImageIdentity = {
  /** Short, human-facing label: `v0.1.0`, `edge`, or `sha256:91935a0b` last. */
  label: string;
  /** Provenance, so the label is never mistaken for a guess. */
  source: "tag" | "manifest" | "label" | "digest";
  /** Build commit, when the image carries one. */
  revision?: string;
  /** The full reference, for `--json` and for the few places that need it. */
  reference: string;
};

const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** `sha256:91935a0b…` — enough to compare two deployments by eye. */
export function shortDigest(reference: string): string {
  const digest = reference.split("@sha256:")[1];
  return digest ? `sha256:${digest.slice(0, 8)}` : reference;
}

/** A semver tag becomes `v0.1.0`; a channel tag (`edge`) stays as written. */
function labelForTag(tag: string): string {
  return semverPattern.test(tag) ? `v${tag}` : tag;
}

/**
 * Reads the OCI labels CI bakes into every published image. This is a local
 * `docker image inspect`, never a registry call: `harly` must stay usable on a
 * host with no outbound network, and the labels are already on disk once the
 * image is pulled.
 */
function inspectLabels(
  reference: string,
): { version?: string; revision?: string } | null {
  const result = run(
    "docker",
    [
      "image",
      "inspect",
      reference,
      "--format",
      "{{index .Config.Labels \"org.opencontainers.image.version\"}}\t{{index .Config.Labels \"org.opencontainers.image.revision\"}}",
    ],
    { allowFailure: true },
  );
  if (result.status !== 0) return null;
  const [version, revision] = String(result.stdout ?? "")
    .trim()
    .split("\t");
  // `docker inspect` prints "<no value>" for absent labels, and an image built
  // outside CI has none at all.
  const clean = (value?: string) =>
    value && value !== "<no value>" ? value : undefined;
  return { version: clean(version), revision: clean(revision) };
}

/**
 * Resolves the friendliest honest name for a deployed image, in descending
 * order of certainty:
 *
 * 1. A tag in the reference itself — what the operator asked for.
 * 2. The release manifest, when the digest matches a published release. A
 *    digest match is proof, so this outranks the image's own claim.
 * 3. The image's OCI labels, written by CI at build time.
 * 4. A short digest. Never the full 64 characters.
 */
export function describeImage(
  reference: string,
  release: HarlyRelease = embeddedRelease,
  inspect: (
    reference: string,
  ) => { version?: string; revision?: string } | null = inspectLabels,
): ImageIdentity {
  // Only the final path segment can carry a tag. Splitting the whole reference
  // on ":" also matches a registry port (`localhost:5000/harly`) and returns
  // the entire string for an untagged reference, both of which would be
  // reported as if the operator had asked for them by name.
  const lastSegment = reference.split("/").at(-1) ?? reference;
  const tag = reference.includes("@sha256:")
    ? undefined
    : lastSegment.includes(":")
      ? lastSegment.split(":").at(-1)
      : undefined;

  // A semver tag is unique on its own, so it needs no build commit to
  // disambiguate it — and skipping the lookup keeps the common release path
  // free of a `docker image inspect` subprocess.
  if (tag && semverPattern.test(tag))
    return { label: labelForTag(tag), source: "tag", reference };

  const labels = inspect(reference);
  const revision = labels?.revision?.slice(0, 7);

  if (tag) return { label: tag, source: "tag", revision, reference };

  // A digest match against the published manifest is proof of which release
  // this is, so it outranks the image's own self-description.
  if (reference.endsWith(`@${release.digest}`))
    return {
      label: labelForTag(release.version),
      source: "manifest",
      revision,
      reference,
    };

  if (labels?.version)
    return {
      label: labelForTag(labels.version),
      source: "label",
      revision,
      reference,
    };

  return { label: shortDigest(reference), source: "digest", revision, reference };
}

/**
 * `v0.1.0 · cd78e8e` — the label plus the build commit when one is known and
 * the label alone is ambiguous. A moving channel like `edge` points at a
 * different build every day, so the commit is what distinguishes two of them;
 * a semver tag is already unique and needs no suffix.
 */
export function versionLine(identity: ImageIdentity): string {
  const ambiguous = identity.source !== "manifest" && !identity.label.startsWith("v");
  return ambiguous && identity.revision
    ? `${identity.label} · ${identity.revision}`
    : identity.label;
}

/**
 * The value written to `HARLY_VERSION`, which the running app echoes at
 * `/api/health/live` and in its OpenAPI document. Machine-facing, so it drops
 * the display `v` prefix and the interpunct separator that `versionLine` uses,
 * and never contains a space.
 */
export function envVersion(identity: ImageIdentity): string {
  // With nothing but a digest to go on, keep the historical 12-character
  // fragment rather than inventing a label: it is what previous deployments
  // recorded, and `sha256:…` reads badly as a version string.
  if (identity.source === "digest") {
    const digest = identity.reference.split("@sha256:")[1];
    return digest ? digest.slice(0, 12) : identity.label;
  }
  const base = identity.label.replace(/^v(?=\d)/, "");
  return !/^\d/.test(base) && identity.revision
    ? `${base}-${identity.revision}`
    : base;
}
