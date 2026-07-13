import { describe, expect, it } from "vitest";

import { matchesInboxFilter } from "./InboxThreadList";

describe("canonical inbox replies", () => {
  it("accepts canonical threads after the server applies reply filtering", () => {
    expect(matchesInboxFilter({
      id: "thread-1",
      source: "mailbox",
      transport: "legacy-webhook",
      subject: "Reply",
      participantEmail: "candidate@example.com",
      status: "open",
      unreadCount: 1,
      lastMessageAt: "2026-01-01T00:00:00.000Z",
      candidateId: "candidate-1",
      candidateName: "Candidate",
      ownerName: null,
      preview: "Hello",
    }, "replies")).toBe(true);
  });
});
