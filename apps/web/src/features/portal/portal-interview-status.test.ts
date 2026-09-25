import { describe, expect, it } from "vitest";

import { portalInterviewStatusLabel } from "./portal-interview-status";

describe("portal interview status", () => {
  it("does not label a scheduled interview in the past as completed", () => {
    expect(portalInterviewStatusLabel("scheduled")).toBe("Scheduled");
  });

  it.each([
    ["completed", "Completed"],
    ["canceled", "Canceled"],
  ] as const)("preserves the %s terminal label", (status, label) => {
    expect(portalInterviewStatusLabel(status)).toBe(label);
  });
});
