import { describe, expect, it } from "vitest";

import { sanitizeErrorMessage } from "./sanitize-error";

describe("sanitizeErrorMessage", () => {
  it("redacts credentials and emails and collapses whitespace", () => {
    expect(
      sanitizeErrorMessage("failed\n\tfor ops@example.test with token=abc123", 300),
    ).toBe("failed for [email] with token=[redacted]");
  });

  it("truncates to the given length, ending with an ellipsis", () => {
    const out = sanitizeErrorMessage("lorem ipsum ".repeat(90), 500);
    expect(Array.from(out)).toHaveLength(500);
    expect(out.endsWith("…")).toBe(true);
    expect(out.startsWith("lorem ipsum")).toBe(true);
  });

  it("returns an empty string for blank input so callers choose the fallback", () => {
    expect(sanitizeErrorMessage("   ", 300)).toBe("");
  });
});
