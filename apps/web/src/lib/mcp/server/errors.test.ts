import { describe, expect, it } from "vitest";

import { ApiError } from "@harly/api";

import { McpToolError } from "../types";
import { GENERIC_ERROR_MESSAGE, mapToolError } from "./errors";

const text = (error: unknown) => mapToolError(error, "req-1");

describe("mapToolError", () => {
  it("passes McpToolError through with its code", () => {
    const mapped = text(new McpToolError("Stage belongs to another job.", "conflict"));
    expect(mapped.result.content[0].text).toBe("Error (conflict): Stage belongs to another job.");
    expect(mapped.unexpected).toBe(false);
  });

  it("maps ApiError codes", () => {
    expect(text(ApiError.notFound("Job not found.")).code).toBe("not_found");
    expect(text(ApiError.forbidden("No.")).code).toBe("forbidden");
    expect(text(ApiError.rateLimited("Slow down.")).code).toBe("rate_limited");
  });

  it("keeps readable messages from existing server actions", () => {
    const mapped = text(new Error("You do not have permission to perform this action."));
    expect(mapped.code).toBe("forbidden");
    expect(mapped.result.content[0].text).toContain("permission");
    expect(text(new Error("Candidate not found.")).code).toBe("not_found");
  });

  it("hides SQL, driver and stack details behind the generic message", () => {
    for (const raw of [
      'Failed query: select "id" from "candidates" where "email" = $1',
      "connect ECONNREFUSED 10.0.0.5:5432",
      "Cannot read properties of undefined (reading 'id')",
      'column "foo" does not exist',
      "duplicate key value violates unique constraint",
    ]) {
      const mapped = text(new Error(raw));
      expect(mapped.unexpected, raw).toBe(true);
      expect(mapped.result.content[0].text).toContain(GENERIC_ERROR_MESSAGE);
      expect(mapped.result.content[0].text).toContain("req-1");
      expect(mapped.result.content[0].text).not.toMatch(/candidates|ECONN|undefined|column|duplicate/);
    }
  });

  it("treats non-Error throws as internal", () => {
    expect(text("boom").unexpected).toBe(true);
  });

  it("turns Next redirect/notFound control flow into not_found", () => {
    const redirectLike = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    expect(text(redirectLike).code).toBe("not_found");
  });
});
