import { describe, expect, it } from "vitest";

import {
  canRetryOrCancel,
  recipientOf,
  statusesForFilter,
  summaryOf,
} from "./describe";

describe("delivery log presentation", () => {
  it("maps filters onto stored statuses", () => {
    expect(statusesForFilter("all")).toBeNull();
    expect(statusesForFilter("failed")).toEqual(["failed"]);
    expect(statusesForFilter("pending")).toEqual(["pending", "processing"]);
    expect(statusesForFilter("sent")).toEqual(["sent"]);
  });

  it("names the recipient from whichever field the email kind stores", () => {
    expect(recipientOf({ candidateEmail: "c@example.com" })).toBe("c@example.com");
    expect(recipientOf({ recipientEmail: "r@example.com" })).toBe("r@example.com");
    expect(recipientOf({ ownerEmail: "o@example.com" })).toBe("o@example.com");
    expect(recipientOf({})).toBeNull();
  });

  it("summarises an interview with its own zone, and says UTC for legacy payloads", () => {
    const scheduledAt = "2026-11-04T14:00:00.000Z";
    expect(summaryOf("interview.scheduled", { jobTitle: "Engineer", scheduledAt, timeZone: "Europe/Madrid" })).toBe(
      "Engineer — Wed, 4 Nov 2026, 3:00 PM (Europe/Madrid)",
    );
    expect(summaryOf("interview.scheduled", { jobTitle: "Engineer", scheduledAt })).toBe(
      "Engineer — Wed, 4 Nov 2026, 2:00 PM (UTC)",
    );
  });

  it("summarises pipeline and offer emails without exposing the raw payload", () => {
    expect(summaryOf("pipeline.stage", { jobTitle: "Engineer", stageName: "Offer" })).toBe("Engineer — moved to Offer");
    expect(summaryOf("pipeline.rejected", { jobTitle: "Engineer" })).toBe("Engineer — not moving forward");
    expect(summaryOf("offer.extended", {})).toBe("Offer for the role");
  });

  it("allows a retry or cancel only before the provider accepted the email", () => {
    expect(canRetryOrCancel({ status: "failed", providerMessageId: null, sentAt: null })).toBe(true);
    expect(canRetryOrCancel({ status: "pending", providerMessageId: null, sentAt: null })).toBe(true);
    expect(canRetryOrCancel({ status: "processing", providerMessageId: null, sentAt: null })).toBe(false);
    expect(canRetryOrCancel({ status: "failed", providerMessageId: "prov-1", sentAt: null })).toBe(false);
    expect(canRetryOrCancel({ status: "sent", providerMessageId: null, sentAt: new Date() })).toBe(false);
    expect(canRetryOrCancel({ status: "cancelled", providerMessageId: null, sentAt: null })).toBe(false);
  });
});
