import { describe, expect, it } from "vitest";

import {
  parseReleaseManifest,
  releaseNotesUrl,
  summarizeReleaseNotes,
} from "./release-channel";

const digest = `sha256:${"a".repeat(64)}`;

describe("parseReleaseManifest", () => {
  it("accepts the official image with a pinned digest", () => {
    expect(
      parseReleaseManifest({ version: "0.2.5", image: "ghcr.io/vytral/harly", digest }),
    ).toEqual({ version: "0.2.5", image: "ghcr.io/vytral/harly", digest });
  });

  it("rejects another registry, a short digest, or a non-version", () => {
    expect(parseReleaseManifest({ version: "0.2.5", image: "evil.example/harly", digest })).toBeNull();
    expect(
      parseReleaseManifest({ version: "0.2.5", image: "ghcr.io/vytral/harly", digest: "sha256:abc" }),
    ).toBeNull();
    expect(
      parseReleaseManifest({ version: "latest", image: "ghcr.io/vytral/harly", digest }),
    ).toBeNull();
    expect(parseReleaseManifest(null)).toBeNull();
  });
});

describe("release notes", () => {
  it("links to the v-prefixed tag", () => {
    expect(releaseNotesUrl("0.2.5")).toBe("https://github.com/Vytral/harly/releases/tag/v0.2.5");
  });

  it("flattens markdown and strips markup", () => {
    expect(
      summarizeReleaseNotes("## Fixes\n- **Resume** parsing [#12](https://x.test)\n<script>alert(1)</script>"),
    ).toBe("Fixes\n• Resume parsing #12\nalert(1)");
  });

  it("drops code fences", () => {
    expect(summarizeReleaseNotes("Move with:\n\n```bash\nnpx @harly/cli update\n```")).toBe(
      "Move with:\n\nnpx @harly/cli update",
    );
  });

  it("caps long bodies", () => {
    const summary = summarizeReleaseNotes("word ".repeat(400), 100)!;
    expect(summary.length).toBeLessThanOrEqual(101);
    expect(summary.endsWith("…")).toBe(true);
  });

  it("returns null for an empty body", () => {
    expect(summarizeReleaseNotes("  ")).toBeNull();
    expect(summarizeReleaseNotes(null)).toBeNull();
  });
});
