import { describe, expect, it } from "vitest";

import { makeT } from "@/test-support/translator";
import { bulkDecisionConfirmCopy } from "./confirmation";

const t = makeT("labels.pipeline.confirmation");

describe("bulk pipeline decision confirmation", () => {
  it("makes the irreversible bulk hire/reject scope explicit", () => {
    expect(bulkDecisionConfirmCopy(t, "hired", 3).title).toMatch(
      /hire 3 applications/i,
    );
    expect(bulkDecisionConfirmCopy(t, "rejected", 2).title).toMatch(
      /reject 2 applications/i,
    );
  });
});
