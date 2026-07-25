import { beforeEach, describe, expect, it, vi } from "vitest";

// The test-ping route must go through the claim+lock dispatcher (not call
// deliverWebhook directly) so a concurrent cron tick can't double-deliver the
// ping via a race on the pending row.

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  reserve: vi.fn(),
  complete: vi.fn(),
  getWebhookEndpoint: vi.fn(),
  dispatchDueWebhooks: vi.fn(),
  insertReturning: vi.fn(),
}));

vi.mock("@/features/developers/data", () => ({
  getWebhookEndpoint: mocks.getWebhookEndpoint,
}));
vi.mock("@/server/api/auth", () => ({
  authenticateApiKey: mocks.authenticate,
  getRequestRateLimit: vi.fn(() => null),
}));
vi.mock("@/server/api/idempotency", () => ({
  reserveIdempotencyKey: mocks.reserve,
  releaseIdempotencyReservation: vi.fn(async () => undefined),
}));
vi.mock("@/server/webhooks/dispatch", () => ({
  dispatchDueWebhooks: mocks.dispatchDueWebhooks,
}));
vi.mock("@harly/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: () => ({
        returning: async () => mocks.insertReturning(),
      }),
    })),
  },
  webhookDeliveries: {},
}));

import { POST } from "./route";

const ENDPOINT_ID = "22222222-2222-4222-8222-222222222222";
const DELIVERY_ID = "33333333-3333-4333-8333-333333333333";
const endpoint = { id: ENDPOINT_ID, url: "https://example.com/hook" };

function buildRequest() {
  return new Request(`https://harly.dev/api/v1/webhooks/${ENDPOINT_ID}/test`, {
    method: "POST",
  });
}

describe("POST /api/v1/webhooks/{id}/test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ workspaceId: "ws-1", keyId: "k" });
    mocks.reserve.mockResolvedValue({
      kind: "reserved",
      key: "idem-1",
      complete: mocks.complete,
    });
    mocks.getWebhookEndpoint.mockResolvedValue(endpoint);
    mocks.insertReturning.mockReturnValue([
      { id: DELIVERY_ID, event: "application.created", payload: {} },
    ]);
    mocks.dispatchDueWebhooks.mockResolvedValue({
      processed: 1,
      success: 1,
      failed: 0,
    });
  });

  it("routes the ping through the claim+lock dispatcher (no direct deliverWebhook)", async () => {
    const ctx = { params: Promise.resolve({ id: ENDPOINT_ID }) };
    const response = await POST(buildRequest(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      delivered: true,
      status: "success",
      deliveryId: DELIVERY_ID,
    });
    // The dispatcher is called with the new delivery id, which claims the row
    // with a worker lock before sending — closing the race where a concurrent
    // cron tick could double-deliver the test ping.
    expect(mocks.dispatchDueWebhooks).toHaveBeenCalledWith(1, [DELIVERY_ID]);
  });

  it("reports not-delivered when the dispatcher fails the delivery", async () => {
    mocks.dispatchDueWebhooks.mockResolvedValue({
      processed: 1,
      success: 0,
      failed: 1,
    });
    const ctx = { params: Promise.resolve({ id: ENDPOINT_ID }) };
    const response = await POST(buildRequest(), ctx);
    const body = await response.json();

    expect(body.data).toMatchObject({
      delivered: false,
      status: "failed",
      deliveryId: DELIVERY_ID,
    });
  });
});
