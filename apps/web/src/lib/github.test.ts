import { describe, expect, it } from "vitest";

import { githubAvatarUrl } from "./github";

describe("githubAvatarUrl", () => {
  it("builds a GitHub avatar URL from a user profile", () => {
    expect(githubAvatarUrl("https://github.com/molret", 96)).toBe(
      "https://github.com/molret.png?size=96",
    );
  });

  it("accepts a trailing slash and www host", () => {
    expect(githubAvatarUrl("https://www.github.com/octo-cat/")).toBe(
      "https://github.com/octo-cat.png?size=80",
    );
  });

  it("rejects non-profile and unsafe URLs", () => {
    expect(githubAvatarUrl("https://github.com/org/repo")).toBeNull();
    expect(githubAvatarUrl("https://example.com/molret")).toBeNull();
    expect(githubAvatarUrl("javascript:alert(1)")).toBeNull();
  });
});
