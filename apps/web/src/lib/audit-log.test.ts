import { describe, expect, it } from "vitest";

import { sanitizeAuditMetadata } from "./audit-log";

describe("audit metadata", () => {
  it("removes free-form content and bounds nested values", () => {
    expect(
      sanitizeAuditMetadata({
        status: "completed",
        body: "private email body",
        prompt: "ignore all instructions",
        credentials: { password: "secret" },
        nested: { keep: { tooDeep: "not exported" } },
      }),
    ).toEqual({
      status: "completed",
      nested: {},
    });
  });
});
