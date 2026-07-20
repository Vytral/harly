import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>[]>,
  inserted: null as Record<string, unknown> | null,
  dispatchDueWebhooks: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray) => strings.join("")),
}));

vi.mock("@harly/db", () => ({
  db: {
    select: vi.fn(() => {
      const rows = mocks.rows.shift() ?? [];
      const query = {
        from: () => query,
        where: () => query,
        orderBy: () => query,
        limit: async () => rows,
      };
      return query;
    }),
    insert: vi.fn(() => ({
      values: (values: Record<string, unknown>) => {
        mocks.inserted = values;
        return { returning: async () => [{ id: "replay-1", ...values }] };
      },
    })),
  },
  apiKeys: {},
  webhookDeliveries: {},
  webhookEndpoints: {},
}));

vi.mock("@/server/webhooks/dispatch", () => ({
  dispatchDueWebhooks: mocks.dispatchDueWebhooks,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { ApiError } from "@harly/api";
import { replayWebhookDelivery } from "./data";

describe("replayWebhookDelivery", () => {
  beforeEach(() => {
    mocks.rows = [
      [{ id: "endpoint-1" }],
      [{ id: "delivery-1", event: "candidate.created", payload: { candidateId: "c-1" } }],
    ];
    mocks.inserted = null;
    mocks.dispatchDueWebhooks.mockReset();
    mocks.dispatchDueWebhooks.mockResolvedValue({ processed: 1, success: 1, failed: 0 });
  });

  it("queues a new pending delivery without mutating original", async () => {
    const replay = await replayWebhookDelivery({
      workspaceId: "workspace-1",
      endpointId: "endpoint-1",
      deliveryId: "delivery-1",
    });

    expect(mocks.inserted).toEqual({
      workspaceId: "workspace-1",
      endpointId: "endpoint-1",
      event: "candidate.created",
      payload: { candidateId: "c-1" },
      status: "pending",
      attempts: 0,
    });
    expect(replay.id).toBe("replay-1");
    // Best-effort immediate delivery is triggered so the replay reaches the
    // endpoint now instead of waiting for the next cron tick.
    expect(mocks.dispatchDueWebhooks).toHaveBeenCalledWith(1, ["replay-1"]);
  });

  it("rejects a delivery outside the scoped endpoint", async () => {
    mocks.rows = [[{ id: "endpoint-1" }], []];

    await expect(
      replayWebhookDelivery({
        workspaceId: "workspace-1",
        endpointId: "endpoint-1",
        deliveryId: "foreign-delivery",
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(mocks.inserted).toBeNull();
    // No dispatch when the delivery wasn't found.
    expect(mocks.dispatchDueWebhooks).not.toHaveBeenCalled();
  });
});
