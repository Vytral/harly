import { describe, expect, it } from "vitest";

import { summarizeInterviewOutcome } from "./interview-outcome";

describe("interview outcome", () => {
  it("reports a provider failure as needs attention", () => {
    expect(
      summarizeInterviewOutcome({
        mode: "video",
        location: null,
        meetLink: null,
        syncs: [{ status: "failed", lastError: "Google Calendar needs reconnect" }],
      }),
    ).toEqual({
      outcomeStatus: "needs_attention",
      warnings: ["Google Calendar needs reconnect"],
    });
  });

  it("accepts an explicit meeting link even without a provider ledger row", () => {
    expect(
      summarizeInterviewOutcome({
        mode: "video",
        location: "https://meet.google.com/example",
        meetLink: "https://meet.google.com/example",
        syncs: [],
      }),
    ).toEqual({ outcomeStatus: "complete", warnings: [] });
  });

  it("flags a video interview saved without any link", () => {
    expect(
      summarizeInterviewOutcome({
        mode: "video",
        location: null,
        meetLink: null,
        syncs: [],
      }),
    ).toMatchObject({ outcomeStatus: "missing_meeting_link" });
  });
});
