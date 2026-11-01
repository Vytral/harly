import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps same-origin paths, including a query string", () => {
    expect(safeRedirectPath("/dashboard/jobs")).toBe("/dashboard/jobs");
    expect(safeRedirectPath("/oauth/authorize?client_id=a&state=b")).toBe(
      "/oauth/authorize?client_id=a&state=b",
    );
  });

  it.each([
    "https://evil.test",
    "//evil.test",
    "///evil.test",
    "/\\evil.test",
    "javascript:alert(1)",
    "/\t/evil.test",
    "dashboard",
    "",
    undefined,
    42,
  ])("rejects %j", (value) => {
    expect(safeRedirectPath(value)).toBe("/dashboard");
  });
});
