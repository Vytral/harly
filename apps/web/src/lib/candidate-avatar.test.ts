import { createHash } from "crypto";

import { describe, expect, it } from "vitest";

import { candidateAvatarFallbackSrcs } from "./candidate-avatar";

const EMAIL = "Ada.Lovelace@Example.test";
const EMAIL_HASH = createHash("sha256")
  .update("ada.lovelace@example.test")
  .digest("hex");
const GITHUB = "https://github.com/ada";

describe("candidateAvatarFallbackSrcs", () => {
  it("never derives or sends a Gravatar URL when the workspace has not opted in", () => {
    const srcs = candidateAvatarFallbackSrcs(EMAIL, null, { gravatarEnabled: false });

    expect(srcs).toEqual([]);
    expect(JSON.stringify(srcs)).not.toContain(EMAIL_HASH);
    expect(JSON.stringify(srcs)).not.toContain("gravatar");
  });

  it("keeps the GitHub fallback when Gravatar is off", () => {
    const srcs = candidateAvatarFallbackSrcs(EMAIL, GITHUB, { gravatarEnabled: false });

    expect(srcs).toHaveLength(1);
    expect(srcs[0]).toContain("github");
    expect(srcs.join(" ")).not.toContain("gravatar");
  });

  it("adds a Gravatar URL keyed by the normalised email when the workspace opted in", () => {
    const [first] = candidateAvatarFallbackSrcs(EMAIL, null, { gravatarEnabled: true });

    expect(first).toBe(
      `https://www.gravatar.com/avatar/${EMAIL_HASH}?d=404&s=80`,
    );
  });

  it("puts Gravatar before GitHub when both are available and the workspace opted in", () => {
    const srcs = candidateAvatarFallbackSrcs(EMAIL, GITHUB, { gravatarEnabled: true });

    expect(srcs).toHaveLength(2);
    expect(srcs[0]).toContain("gravatar.com");
    expect(srcs[1]).toContain("github");
  });

  it("returns nothing for a candidate with no email, even when opted in", () => {
    expect(candidateAvatarFallbackSrcs(null, null, { gravatarEnabled: true })).toEqual([]);
  });
});
