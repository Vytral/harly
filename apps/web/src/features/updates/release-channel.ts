/**
 * The release channel the web app reads is the one the CLI reads
 * (tooling/harly/src/index.ts `officialRelease`): `release-manifest.json` on
 * the main branch, which CI moves only when a stable tag is published. The
 * accepted shape is the CLI's `validRelease`, so the two cannot disagree on
 * what counts as a release.
 */
export type ReleaseManifest = {
  version: string;
  image: string;
  digest: string;
};

export const DEFAULT_RELEASE_MANIFEST_URL =
  "https://raw.githubusercontent.com/Vytral/harly/main/release-manifest.json";

export const OFFICIAL_IMAGE = "ghcr.io/vytral/harly";

export function parseReleaseManifest(candidate: unknown): ReleaseManifest | null {
  if (!candidate || typeof candidate !== "object") return null;
  const release = candidate as Partial<ReleaseManifest>;
  if (
    typeof release.version === "string" &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(release.version) &&
    release.image === OFFICIAL_IMAGE &&
    typeof release.digest === "string" &&
    /^sha256:[a-f0-9]{64}$/.test(release.digest)
  ) {
    return {
      version: release.version,
      image: release.image,
      digest: release.digest,
    };
  }
  return null;
}

/** Release tags are `vX.Y.Z`; see scripts/stable-channel.mjs. */
export function releaseNotesUrl(version: string): string {
  return `https://github.com/Vytral/harly/releases/tag/v${version}`;
}

export function releaseNotesApiUrl(version: string): string {
  return `https://api.github.com/repos/Vytral/harly/releases/tags/v${version}`;
}

/**
 * Turns a release body into a short plain-text excerpt: markdown markers and
 * links are flattened, and the result is capped. It is shown as text, never
 * parsed as HTML, so nothing in a release body can inject markup into the page.
 */
export function summarizeReleaseNotes(body: string | null | undefined, max = 600): string | null {
  if (!body) return null;
  const text = body
    .replace(/\r/g, "")
    .replace(/^\s*```.*$/gm, "")
    .replace(/<[^>]*>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/^\s*[-+]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trimEnd()}…`;
}
