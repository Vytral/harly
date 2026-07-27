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
});
