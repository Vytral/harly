import { describe, expect, it } from "vitest";

import { escapeLikePattern } from "./patterns";

describe("workspace search patterns", () => {
  it("escapes LIKE metacharacters from user input", () => {
    expect(escapeLikePattern("100%_ready\\now")).toBe("100\\%\\_ready\\\\now");
  });
});
