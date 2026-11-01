/**
 * Minimal SemVer helpers for the update flow. The CLI owns the full parser
 * (tooling/harly/src/version.ts); the web app only has to compare the running
 * version with the release channel's, so this stays deliberately small.
 */

export type UpdateKind = "patch" | "minor" | "major";
export type AutoUpdateLevel = "patch" | "minor";

type Parsed = { major: number; minor: number; patch: number; pre: string | null };

const pattern = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Versions the release channel serves: 0.2.5 (stable), 0.3.0-rc.1 (pre). */
export function parseReleaseVersion(value: string | null | undefined): Parsed | null {
  const match = value?.trim().match(pattern);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ?? null,
  };
}

export function isStableReleaseVersion(value: string | null | undefined): boolean {
  const parsed = parseReleaseVersion(value);
  return parsed !== null && parsed.pre === null;
}

/** Negative when `left` is older, null when either side is not SemVer. */
export function compareReleaseVersions(left: string, right: string): number | null {
  const a = parseReleaseVersion(left);
  const b = parseReleaseVersion(right);
  if (!a || !b) return null;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.pre === b.pre) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  return a.pre < b.pre ? -1 : 1;
}

/** How big a jump `current → latest` is, or null when it is not an upgrade. */
export function classifyUpdate(current: string, latest: string): UpdateKind | null {
  const from = parseReleaseVersion(current);
  const to = parseReleaseVersion(latest);
  const order = compareReleaseVersions(current, latest);
  if (!from || !to || order === null || order >= 0) return null;
  if (to.major !== from.major) return "major";
  if (to.minor !== from.minor) return "minor";
  return "patch";
}

/**
 * Whether the auto-update policy may install `latest` over `current`. Major
 * releases are never installed unattended, and neither are pre-releases or a
 * running version that is not a release (dev builds, bare digests).
 */
export function autoUpdateAllows(
  level: AutoUpdateLevel,
  current: string,
  latest: string,
): boolean {
  if (!isStableReleaseVersion(latest)) return false;
  const kind = classifyUpdate(current, latest);
  if (kind === null || kind === "major") return false;
  return level === "minor" ? true : kind === "patch";
}
