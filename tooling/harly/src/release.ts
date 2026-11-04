// Generated from release-manifest.json by scripts/sync-release-assets.mjs.
// Do not edit by hand.
export type HarlyRelease = {
  version: string;
  image: string;
  digest: string;
};

export const embeddedRelease: HarlyRelease = {
  version: "0.3.2",
  image: "ghcr.io/vytral/harly",
  digest: "sha256:65223e10d44cbf33a5cf63a9e6313802fcf138a054819fc49fa708bfdda1ae06",
};

export const releaseTagImage = (release: HarlyRelease) => `${release.image}:${release.version}`;
export const releaseImage = (release: HarlyRelease) => `${release.image}@${release.digest}`;
