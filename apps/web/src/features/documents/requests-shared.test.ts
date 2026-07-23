import { describe, expect, it } from "vitest";

import {
  canCandidateUpload,
  canReviewRequest,
  isTerminalRequestStatus,
  DOCUMENT_REQUEST_STATUS_META,
} from "./requests-shared";

describe("document request status rules", () => {
  it("lets the candidate upload only while pending or after a decline", () => {
    expect(canCandidateUpload("pending")).toBe(true);
    expect(canCandidateUpload("declined")).toBe(true);
    expect(canCandidateUpload("submitted")).toBe(false);
    expect(canCandidateUpload("accepted")).toBe(false);
    expect(canCandidateUpload("waived")).toBe(false);
  });

  it("lets a reviewer act only on a submitted request", () => {
    expect(canReviewRequest("submitted")).toBe(true);
    expect(canReviewRequest("pending")).toBe(false);
    expect(canReviewRequest("accepted")).toBe(false);
    expect(canReviewRequest("declined")).toBe(false);
  });

  it("treats accepted and waived as terminal", () => {
    expect(isTerminalRequestStatus("accepted")).toBe(true);
    expect(isTerminalRequestStatus("waived")).toBe(true);
    expect(isTerminalRequestStatus("pending")).toBe(false);
    expect(isTerminalRequestStatus("submitted")).toBe(false);
    expect(isTerminalRequestStatus("declined")).toBe(false);
  });

  it("has display metadata for every status", () => {
    for (const status of ["pending", "submitted", "accepted", "declined", "waived"] as const) {
      expect(DOCUMENT_REQUEST_STATUS_META[status]).toBeDefined();
      expect(DOCUMENT_REQUEST_STATUS_META[status].label.length).toBeGreaterThan(0);
    }
  });
});
