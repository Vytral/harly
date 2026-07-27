import { describe, expect, it } from "vitest";
import { createScimTokenValue, hashScimToken } from "./service";

describe("SCIM credentials", () => {
  it("creates high-entropy, non-reversible bearer values", () => {
    const first = createScimTokenValue();
    const second = createScimTokenValue();
    expect(first.raw).toMatch(/^harly_scim_[A-Za-z0-9_-]{40,}$/);
    expect(first.raw).not.toBe(second.raw);
    expect(first.hash).toBe(hashScimToken(first.raw));
    expect(first.hash).not.toContain(first.raw);
    expect(first.prefix).toBe(first.raw.slice(0, 18));
  });
});
