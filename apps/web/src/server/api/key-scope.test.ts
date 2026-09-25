import { describe, expect, it } from "vitest";

import { canRotateApiKeyScopes } from "./key-scope";

describe("canRotateApiKeyScopes", () => {
  it("allows rotation when the caller covers every existing scope", () => {
    expect(
      canRotateApiKeyScopes(
        ["candidates:read", "candidates:write"],
        ["candidates:read", "candidates:write", "jobs:read"],
      ),
    ).toBe(true);
  });

  it("blocks scope escalation through rotation", () => {
    expect(
      canRotateApiKeyScopes(["candidates:write"], ["candidates:read"]),
    ).toBe(false);
  });
});
