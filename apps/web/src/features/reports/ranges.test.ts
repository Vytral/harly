import { describe, expect, it } from "vitest";

import { normalizeReportRange } from "./ranges";

describe("report ranges", () => {
  it("keeps supported report windows", () => {
    expect(normalizeReportRange(30)).toBe(30);
    expect(normalizeReportRange(90)).toBe(90);
    expect(normalizeReportRange(365)).toBe(365);
  });

  it("normalizes unsupported report windows to the safe default", () => {
    expect(normalizeReportRange(7)).toBe(30);
    expect(normalizeReportRange(Number.NaN)).toBe(30);
  });
});
