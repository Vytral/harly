// Generated from release-manifest.json by scripts/sync-release-assets.mjs.
// Do not edit by hand.
export type HarlyRelease = {
  version: string;
  image: string;
  digest: string;
};

export const embeddedRelease: HarlyRelease = {
  version: "0.2.2",
  image: "ghcr.io/vytral/harly",
  digest: "sha256:4b9ef3dcd7de10c5276df9f1d4322a1beacc035c99c7ed98f201a8d39e7f1d2d",
};

export const releaseTagImage = (release: HarlyRelease) => `${release.image}:${release.version}`;
export const releaseImage = (release: HarlyRelease) => `${release.image}@${release.digest}`;
