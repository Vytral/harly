import { describe, expect, it } from "vitest";

import { bulkDecisionConfirmationMessage } from "./confirmation";

describe("bulk pipeline decision confirmation", () => {
  it("makes the irreversible bulk hire/reject scope explicit", () => {
    expect(bulkDecisionConfirmationMessage("hired", 3)).toMatch(
      /hire 3 applications/i,
    );
    expect(bulkDecisionConfirmationMessage("rejected", 2)).toMatch(
      /reject 2 applications/i,
    );
  });
});
