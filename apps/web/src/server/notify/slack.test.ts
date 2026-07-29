import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postMessage: vi.fn(),
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@slack/web-api", () => ({
  WebClient: vi.fn(function () {
    return { chat: { postMessage: mocks.postMessage } };
  }),
}));
vi.mock("@harly/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ onConflictDoNothing: vi.fn(async () => undefined) })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        mocks.updates.push(values);
        return { where: vi.fn(async () => undefined) };
      }),
    })),
  },
  slackDeliveries: {
    id: "id",
    workspaceId: "workspace_id",
    status: "status",
    lockedBy: "locked_by",
  },
  slackDeliveryAttempts: {},
  workspaceSettings: { organizationId: "organization_id" },
}));
vi.mock("@/lib/slack/config", () => ({
  getWorkspaceSlackConfig: vi.fn(async () => ({
    botToken: "xoxb-test",
    channelId: "C123",
    events: ["candidate.created"],
  })),
}));
vi.mock("@/server/observability/metrics", () => ({ recordSlackDelivery: vi.fn() }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn(), warn: vi.fn() }) }));

import { buildSlackPayload, deliverSlack } from "./slack";

describe("Slack notification payload", () => {
  it("never includes candidate contact data", () => {
    const payload = buildSlackPayload("candidate.created", {
      candidate: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+1 555 0100",
        resumeUrl: "https://private.example/resume.pdf",
      },
    });

    const serialized = JSON.stringify(payload);
    expect(serialized).toContain("Ada Lovelace");
    expect(serialized).not.toContain("ada@example.com");
    expect(serialized).not.toContain("555 0100");
    expect(serialized).not.toContain("private.example");
  });

  it("renders a job event without requiring candidate data", () => {
    const payload = buildSlackPayload("job.published", {
      job: { title: "Staff Engineer" },
    });

    expect(payload.text).toContain("Staff Engineer");
    expect(payload.blocks).toHaveLength(2);
  });

  it("honors Slack Retry-After and keeps the delivery retryable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    mocks.updates.length = 0;
    mocks.postMessage.mockRejectedValueOnce(
      Object.assign(new Error("rate limited"), {
        retryAfter: 42,
        data: { error: "ratelimited" },
      }),
    );

    const result = await deliverSlack(
      {
        id: "delivery-1",
        workspaceId: "workspace-1",
        event: "candidate.created",
        channelId: "C123",
        payload: { text: "Candidate created", blocks: [] },
        attempts: 0,
      } as Parameters<typeof deliverSlack>[0],
      "worker-1",
    );

    expect(result).toBe("failed");
    expect(mocks.updates[0]).toMatchObject({
      status: "failed",
      nextRetryAt: new Date("2026-01-01T00:00:42.000Z"),
    });
    vi.useRealTimers();
  });
});
