import { describe, expect, it } from "vitest";
import { ApiError, DEFAULT_LIMIT, MAX_LIMIT, parseLimit } from "@harly/api";

describe("parseLimit", () => {
  it("defaults when absent and clamps to the maximum", () => {
    expect(parseLimit(null)).toBe(DEFAULT_LIMIT);
    expect(parseLimit("")).toBe(DEFAULT_LIMIT);
    expect(parseLimit("10")).toBe(10);
    expect(parseLimit("5000")).toBe(MAX_LIMIT);
  });

  it.each(["10abc", "1.5", "1e3", " 7", "-3", "0", "abc", "99999999999999999999"])(
    "rejects %j",
    (raw) => {
      expect(() => parseLimit(raw)).toThrow(ApiError);
    },
  );
});
