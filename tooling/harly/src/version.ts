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

/** Versions Harly will publish or install: 0.2.0, 0.2.0-beta.1, 0.2.0-rc.1. */
export const releaseVersionPattern = /^\d+\.\d+\.\d+(?:-(?:beta|rc)\.\d+)?$/;

export function isReleaseVersion(value: string): boolean {
  return releaseVersionPattern.test(value);
}

/**
 * A stable release: `0.2.0`. A numbered beta or rc is a release Harly will
 * publish and install on request, but it is not what the stable channel serves.
 */
export function isStableVersion(value: string): boolean {
  return isReleaseVersion(value) && !value.includes("-");
}

type ParsedSemver = {
  major: number;
  minor: number;
  patch: number;
  pre: string[];
};

function parseSemver(value: string): ParsedSemver | null {
  const match = value
    .replace(/^v(?=\d)/, "")
    .match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ? match[4].split(".") : [],
  };
}

function compareIdentifiers(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 0;
  // 1.0.0 is newer than 1.0.0-beta.1.
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
      const diff = Number(a) - Number(b);
      if (diff !== 0) return diff;
    } else if (aNumeric) return -1;
    else if (bNumeric) return 1;
    else if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
}

/** Negative when `left` is older. Null when either value is not SemVer. */
export function compareSemver(left: string, right: string): number | null {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return null;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  return compareIdentifiers(a.pre, b.pre);
}

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
