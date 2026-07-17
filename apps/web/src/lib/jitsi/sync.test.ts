import { describe, expect, it, vi } from "vitest";

vi.mock("@harly/db", () => ({
  db: {},
  interviews: {},
  workspaceSettings: {},
}));
vi.mock("server-only", () => ({}));

import { generateJitsiRoom } from "./sync";

describe("generateJitsiRoom", () => {
  it("matches the Meet-style xxx-xxxx-xxx format", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateJitsiRoom()).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    }
  });

  it("never emits the ambiguous letter l", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateJitsiRoom()).not.toContain("l");
    }
  });

  it("produces unique rooms across many draws", () => {
    const seen = new Set(Array.from({ length: 1000 }, generateJitsiRoom));
    // 10 random letters from a 25-char alphabet , collisions in 1000 draws
    // would indicate broken randomness.
    expect(seen.size).toBe(1000);
  });
});
