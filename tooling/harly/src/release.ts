// Generated from release-manifest.json by scripts/sync-release-assets.mjs.
// Do not edit by hand.
export type HarlyRelease = {
  version: string;
  image: string;
  digest: string;
};

export const embeddedRelease: HarlyRelease = {
  version: "0.4.0",
  image: "ghcr.io/vytral/harly",
  digest: "sha256:d7edf5bbce260b3d2d1763d1eb39d0e0cb3ceb908d4133831a659ddca327f298",
};

export const releaseTagImage = (release: HarlyRelease) => `${release.image}:${release.version}`;
export const releaseImage = (release: HarlyRelease) => `${release.image}@${release.digest}`;
