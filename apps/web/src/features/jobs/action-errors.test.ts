import { describe, expect, it } from "vitest";

import { getJobActionErrorKey, JOB_ACTION_ERROR_CODES } from "./action-errors";

describe("getJobActionErrorKey", () => {
  it.each(JOB_ACTION_ERROR_CODES.map((code) => [code]))(
    "accepts the stable code %s",
    (code) => {
      expect(getJobActionErrorKey(code)).toBe(code);
    },
  );

  it("returns null for missing or unknown codes", () => {
    expect(getJobActionErrorKey(null)).toBeNull();
    expect(getJobActionErrorKey(undefined)).toBeNull();
    expect(getJobActionErrorKey("Job not found.")).toBeNull();
    expect(getJobActionErrorKey("A database connection failed.")).toBeNull();
  });
});
