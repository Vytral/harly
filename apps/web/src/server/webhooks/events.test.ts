import { describe, expect, it } from "vitest";

import { buildWebhookEnvelope, WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS } from "./events";

describe("webhook event contract", () => {
  it("keeps the legacy envelope fields and adds stable event metadata", () => {
    const envelope = buildWebhookEnvelope({
      event: "task.updated",
      workspaceId: "workspace-1",
      eventId: "event-1",
      occurredAt: "2026-09-09T12:34:56.000Z",
      aggregateType: "task",
      aggregateId: "task-1",
      data: { task: { id: "task-1" } },
    });

    expect(envelope).toMatchObject({
      event: "task.updated",
      eventId: "event-1",
      eventVersion: 1,
      schemaVersion: 1,
      occurredAt: "2026-09-09T12:34:56.000Z",
      created: 1788957296,
      workspace: "workspace-1",
      workspaceId: "workspace-1",
      aggregate: { type: "task", id: "task-1" },
      data: { task: { id: "task-1" } },
    });
  });

  it("has a label for every subscribable event", () => {
    for (const event of WEBHOOK_EVENTS) expect(WEBHOOK_EVENT_LABELS[event]).toBeTruthy();
  });
});
