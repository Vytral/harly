// Generated from release-manifest.json by scripts/sync-release-assets.mjs.
// Do not edit by hand.
export type HarlyRelease = {
  version: string;
  image: string;
  digest: string;
};

export const embeddedRelease: HarlyRelease = {
  version: "0.5.0",
  image: "ghcr.io/vytral/harly",
  digest: "sha256:eea7d6a646a5d4e2bf577b24d0307e42d2ec31edc88ca06aabbd1d9d971a82df",
};

export const releaseTagImage = (release: HarlyRelease) => `${release.image}:${release.version}`;
export const releaseImage = (release: HarlyRelease) => `${release.image}@${release.digest}`;
