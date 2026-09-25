import { describe, expect, it } from "vitest";

import { sha256Hex } from "./hash";

describe("portable SHA-256 graph hashing", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["Harly automations ✓", "8fd03b0a0d2ab279bd7b00c2ceaaf364991fa5a3812f04b5cb33afe89ace05a1"],
  ])("matches standard SHA-256 for %j", (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
  });
});
