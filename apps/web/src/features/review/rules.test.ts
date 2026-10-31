import { describe, expect, it } from "vitest";

import {
  indexMyScorecards,
  isPendingMyReview,
  needsScheduling,
  reviewApplicationHref,
  type ReviewStageRow,
} from "./rules";

const row = (over: Partial<ReviewStageRow> = {}): ReviewStageRow => ({
  applicationId: "app-1",
  stageId: "stage-1",
  stageName: "Screening",
  kind: "screening",
  hasInterview: false,
  ...over,
});

describe("isPendingMyReview", () => {
  it("is pending when I have not submitted a scorecard", () => {
    expect(isPendingMyReview(row(), indexMyScorecards([]))).toBe(true);
  });

  it("is cleared by my own scorecard for that application and stage", () => {
    const mine = indexMyScorecards([
      { applicationId: "app-1", stageId: "stage-1", stageName: "Screening" },
    ]);
    expect(isPendingMyReview(row(), mine)).toBe(false);
  });

  it("is not cleared by a scorecard for another application of the same candidate", () => {
    const mine = indexMyScorecards([
      { applicationId: "app-2", stageId: "stage-1", stageName: "Screening" },
    ]);
    expect(isPendingMyReview(row(), mine)).toBe(true);
  });

  it("is pending again once the application moves to a new stage", () => {
    const mine = indexMyScorecards([
      { applicationId: "app-1", stageId: "stage-1", stageName: "Screening" },
    ]);
    const moved = row({ stageId: "stage-2", stageName: "Interview", kind: "interview", hasInterview: true });
    expect(isPendingMyReview(moved, mine)).toBe(true);
  });

  it("falls back to the stage name for scorecards without a stage id", () => {
    const mine = indexMyScorecards([
      { applicationId: "app-1", stageId: null, stageName: "Screening" },
    ]);
    expect(isPendingMyReview(row(), mine)).toBe(false);
  });

  it("ignores scorecards that are not tied to an application", () => {
    const mine = indexMyScorecards([{ applicationId: null, stageId: null, stageName: "Screening" }]);
    expect(isPendingMyReview(row(), mine)).toBe(true);
  });

  it("does not ask for interview feedback before an interview exists", () => {
    const interview = row({ kind: "interview", stageName: "Interview" });
    expect(isPendingMyReview(interview, indexMyScorecards([]))).toBe(false);
    expect(isPendingMyReview({ ...interview, hasInterview: true }, indexMyScorecards([]))).toBe(true);
  });
});

describe("needsScheduling", () => {
  it("flags interview-stage applications with no interview", () => {
    expect(needsScheduling(row({ kind: "interview" }))).toBe(true);
    expect(needsScheduling(row({ kind: "interview", hasInterview: true }))).toBe(false);
    expect(needsScheduling(row({ kind: "screening" }))).toBe(false);
  });

  it("never overlaps with the review queue", () => {
    const rows = [
      row({ kind: "interview" }),
      row({ kind: "interview", hasInterview: true }),
      row({ kind: "screening" }),
    ];
    const mine = indexMyScorecards([]);
    for (const r of rows) {
      expect(isPendingMyReview(r, mine) && needsScheduling(r)).toBe(false);
    }
  });
});

describe("reviewApplicationHref", () => {
  it("opens the application in queue mode", () => {
    expect(reviewApplicationHref("cand", "app")).toBe(
      "/dashboard/candidates/cand?queue=review&application=app",
    );
  });
});
