import { describe, expect, it } from "vitest";

import { formatSseEvent, type RealtimeEnvelope } from "./realtime";

const event: RealtimeEnvelope = {
  eventId: "event-1",
  eventName: "notifications.invalidate",
  eventVersion: 1,
  schemaVersion: 1,
  workspaceId: "workspace-1",
  payload: { reason: "notification.created" },
  occurredAt: "2026-07-26T00:00:00.000Z",
};

describe("realtime SSE envelope", () => {
  it("serializes an event with an id and named event", () => {
    const output = formatSseEvent(event);

    expect(output).toContain("id: event-1\n");
    expect(output).toContain("event: notifications.invalidate\n");
    expect(output).toContain('"workspaceId":"workspace-1"');
    expect(output.endsWith("\n\n")).toBe(true);
  });

  it("never leaks domain entities to scope-limited members", () => {
    const output = formatSseEvent({
      ...event,
      eventName: "domain.invalidate",
      aggregateType: "candidate",
      aggregateId: "cand-1",
      actorId: "user-1",
      payload: {
        domainEvent: "candidate.updated",
        candidate: { email: "secret@example.test", phone: "+15550100" },
      },
    });

    expect(output).toContain('"domainEvent":"candidate.updated"');
    expect(output).not.toContain("secret@example.test");
    expect(output).not.toContain("+15550100");
    expect(output).not.toContain("cand-1");
    expect(output).not.toContain("user-1");
  });
});
