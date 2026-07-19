import { describe, expect, it } from "vitest";

import {
  ACTIVE_POOL_ENTRY_CONFLICT_MESSAGE,
  isActivePoolEntryUniqueViolation,
} from "./errors";

describe("pool entry concurrency errors", () => {
  it("recognizes the active pool unique constraint", () => {
    expect(
      isActivePoolEntryUniqueViolation({
        code: "23505",
        constraint_name: "pool_entries_active_workspace_candidate_idx",
      }),
    ).toBe(true);
  });

  it("does not classify unrelated database errors as pool conflicts", () => {
    expect(
      isActivePoolEntryUniqueViolation({
        code: "23505",
        constraint_name: "applications_workspace_candidate_job_idx",
      }),
    ).toBe(false);
    expect(isActivePoolEntryUniqueViolation({ code: "23503" })).toBe(false);
  });

  it("exposes the shared conflict message", () => {
    expect(ACTIVE_POOL_ENTRY_CONFLICT_MESSAGE).toBe("Candidate is already in the pool.");
  });
});
