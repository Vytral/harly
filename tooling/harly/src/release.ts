// Generated from release-manifest.json by scripts/sync-release-assets.mjs.
// Do not edit by hand.
export type HarlyRelease = {
  version: string;
  image: string;
  digest: string;
};

export const embeddedRelease: HarlyRelease = {
  version: "0.2.1",
  image: "ghcr.io/vytral/harly",
  digest: "sha256:4b0d0c9e5d29f0e98860e27aac108d745ac0273b2f2dfbd595362d092e58cc3b",
};

export const releaseTagImage = (release: HarlyRelease) => `${release.image}:${release.version}`;
export const releaseImage = (release: HarlyRelease) => `${release.image}@${release.digest}`;
