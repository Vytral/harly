import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: { insert: mocks.insert },
  notifications: {
    workspaceId: "workspace_id",
    userId: "user_id",
    dedupeKey: "dedupe_key",
  },
  member: {},
  jobHiringTeam: {},
}));

vi.mock("@/server/webhooks/events", () => ({
  WEBHOOK_EVENT_LABELS: { "candidate.created": "Candidate created" },
}));

import { createNotification } from "./inbox";

describe("in-app notification persistence", () => {
  it("deduplicates recipients and uses the workspace/user event key", async () => {
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.values.mockReturnValue({ onConflictDoNothing: mocks.onConflictDoNothing });

    await createNotification({
      workspaceId: "workspace-1",
      recipientIds: ["user-1", "user-1", "user-2"],
      type: "email.received",
      title: "Candidate replied",
      dedupeKey: "email:message-1",
    });

    expect(mocks.values).toHaveBeenCalledWith([
      expect.objectContaining({ userId: "user-1", dedupeKey: "email:message-1" }),
      expect.objectContaining({ userId: "user-2", dedupeKey: "email:message-1" }),
    ]);
    expect(mocks.onConflictDoNothing).toHaveBeenCalledWith({
      target: ["workspace_id", "user_id", "dedupe_key"],
    });
  });
});
