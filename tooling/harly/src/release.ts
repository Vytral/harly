// Generated from release-manifest.json by scripts/sync-release-assets.mjs.
// Do not edit by hand.
export type HarlyRelease = {
  version: string;
  image: string;
  digest: string;
};

export const embeddedRelease: HarlyRelease = {
  version: "0.1.0-beta.2",
  image: "ghcr.io/vytral/harly",
  digest: "sha256:f0b999a76fa170887f625d12835379ef57772903c792fb0b66faea9270776a16",
};

export const releaseTagImage = (release: HarlyRelease) => `${release.image}:${release.version}`;
export const releaseImage = (release: HarlyRelease) => `${release.image}@${release.digest}`;
