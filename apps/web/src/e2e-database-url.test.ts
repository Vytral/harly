import { describe, expect, it } from "vitest";

import {
  DEFAULT_E2E_DATABASE_URL,
  resolveE2EDatabaseUrl,
} from "../e2e/constants";

describe("E2E database URL", () => {
  it("preserves the harly_e2e default when no override is configured", () => {
    expect(resolveE2EDatabaseUrl({})).toBe(
      "postgresql://harly:harly@localhost:5432/harly_e2e",
    );
    expect(DEFAULT_E2E_DATABASE_URL).toBe(
      "postgresql://harly:harly@localhost:5432/harly_e2e",
    );
  });

  it("uses the optional HARLY_E2E_DATABASE_URL override", () => {
    expect(
      resolveE2EDatabaseUrl({
        HARLY_E2E_DATABASE_URL:
          "postgresql://harly:harly@localhost:5432/harly_e2e_release_020",
      }),
    ).toBe(
      "postgresql://harly:harly@localhost:5432/harly_e2e_release_020",
    );
  });

  it("treats an empty override as unset", () => {
    expect(resolveE2EDatabaseUrl({ HARLY_E2E_DATABASE_URL: "" })).toBe(
      DEFAULT_E2E_DATABASE_URL,
    );
  });
});
