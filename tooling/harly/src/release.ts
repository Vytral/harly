// Generated from release-manifest.json by scripts/sync-release-assets.mjs.
// Do not edit by hand.
export type HarlyRelease = {
  version: string;
  image: string;
  digest: string;
};

export const embeddedRelease: HarlyRelease = {
  version: "0.3.1",
  image: "ghcr.io/vytral/harly",
  digest: "sha256:7f3b28d5ca689f52194142bc031a5d66e851bdaae21df6c98f13f5475d33b2cb",
};

export const releaseTagImage = (release: HarlyRelease) => `${release.image}:${release.version}`;
export const releaseImage = (release: HarlyRelease) => `${release.image}@${release.digest}`;
