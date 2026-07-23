import { describe, expect, it } from "vitest";

import {
  verifyDocusealSecret,
  webhookEventKey,
  webhookMetadata,
  webhookSubmissionId,
  webhookSubmissionStatus,
  type DocusealWebhookEvent,
} from "./webhook";

describe("docuseal webhook helpers", () => {
  it("verifies the shared secret in constant time", () => {
    expect(verifyDocusealSecret("abc", "abc")).toBe(true);
    expect(verifyDocusealSecret("abc", "abcd")).toBe(false);
    expect(verifyDocusealSecret("abc", "xyz")).toBe(false);
    expect(verifyDocusealSecret(null, "abc")).toBe(false);
    expect(verifyDocusealSecret("abc", null)).toBe(false);
  });

  it("resolves the submission id for submission-level events", () => {
    const event: DocusealWebhookEvent = {
      event_type: "submission.completed",
      data: { id: 42, status: "completed" },
    };
    expect(webhookSubmissionId(event)).toBe("42");
    expect(webhookSubmissionStatus(event)).toBe("completed");
  });

  it("resolves the submission id from the nested block for form events", () => {
    const event: DocusealWebhookEvent = {
      event_type: "form.completed",
      data: {
        id: 7, // submitter id, NOT the submission id
        status: "completed",
        submission: { id: 99, status: "completed" },
      },
    };
    expect(webhookSubmissionId(event)).toBe("99");
    expect(webhookSubmissionStatus(event)).toBe("completed");
  });

  it("reads correlation metadata and builds a stable event key", () => {
    const event: DocusealWebhookEvent = {
      event_type: "submission.completed",
      timestamp: "2026-07-22T10:00:00Z",
      data: { id: 5, metadata: { offerId: "off_1", workspaceId: "ws_1" } },
    };
    expect(webhookMetadata(event, "offerId")).toBe("off_1");
    expect(webhookMetadata(event, "missing")).toBeNull();
    expect(webhookEventKey(event)).toBe("5|submission.completed|2026-07-22T10:00:00Z");
  });
});
