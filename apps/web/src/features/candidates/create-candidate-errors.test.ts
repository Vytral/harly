import { describe, expect, it } from "vitest";

import { isCandidateEmailConflict } from "./create-candidate-errors";

describe("isCandidateEmailConflict", () => {
  it("recognizes the candidate email constraint through nested driver errors", () => {
    expect(
      isCandidateEmailConflict({
        cause: {
          code: "23505",
          constraint: "candidates_workspace_email_idx",
        },
      }),
    ).toBe(true);
  });

  it("does not hide unrelated unique violations", () => {
    expect(
      isCandidateEmailConflict({
        code: "23505",
        constraint: "some_other_unique_index",
      }),
    ).toBe(false);
  });
});
