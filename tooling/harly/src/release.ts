// Generated from release-manifest.json by scripts/sync-release-assets.mjs.
// Do not edit by hand.
export type HarlyRelease = {
  version: string;
  image: string;
  digest: string;
};

export const embeddedRelease: HarlyRelease = {
  version: "0.5.2",
  image: "ghcr.io/vytral/harly",
  digest: "sha256:cf7399246a950c0863a49fd3a145ca14a06aa6932c1ccd3d372729436d6a4eda",
};

export const releaseTagImage = (release: HarlyRelease) => `${release.image}:${release.version}`;
export const releaseImage = (release: HarlyRelease) => `${release.image}@${release.digest}`;
