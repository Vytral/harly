import { describe, expect, it } from "vitest";

import {
  statusForStageName,
  terminalStageNameForStatus,
} from "./state";

describe("pipeline state mapping", () => {
  it.each([
    ["Hired", "hired"],
    [" rejected ", "rejected"],
    ["Interview", "active"],
    ["Offer", "active"],
  ] as const)("maps %s to %s", (stageName, status) => {
    expect(statusForStageName(stageName)).toBe(status);
  });

  it("only maps terminal statuses to terminal stage names", () => {
    expect(terminalStageNameForStatus("hired")).toBe("Hired");
    expect(terminalStageNameForStatus("rejected")).toBe("Rejected");
    expect(terminalStageNameForStatus("active")).toBeNull();
    expect(terminalStageNameForStatus("withdrawn")).toBeNull();
  });
});
