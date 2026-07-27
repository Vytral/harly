import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { MAX_WEBHOOK_ATTEMPTS } from "./events";

const mocks = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  safeFetchWebhook: vi.fn(),
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
  webhookDeliveries: {},
  webhookDeliveryAttempts: {},
  webhookEndpoints: {},
}));

vi.mock("@/lib/crypto", () => ({ decryptSecret: vi.fn(() => "secret") }));
vi.mock("@/lib/ssrf", () => ({ safeFetchWebhook: mocks.safeFetchWebhook }));

import { deliverWebhook } from "./dispatch";

function delivery(attempts = 0) {
  return {
    id: "delivery-1",
    attempts,
    payload: { event: "candidate.created" },
  } as Parameters<typeof deliverWebhook>[0];
}

const endpoint = {
  id: "endpoint-1",
  url: "https://example.com/webhook",
  secretCiphertext: "ciphertext",
  secretIv: "iv",
  secretTag: "tag",
} as Parameters<typeof deliverWebhook>[1];

describe("deliverWebhook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    mocks.updates.length = 0;
    mocks.safeFetchWebhook.mockRejectedValue(new Error("network failed"));
  });

  afterEach(() => vi.useRealTimers());

  it("schedules first failed attempt one minute later", async () => {
    await expect(deliverWebhook(delivery(), endpoint)).resolves.toBe("failed");

    expect(mocks.updates[0]).toMatchObject({
      status: "failed",
      attempts: 1,
      nextRetryAt: new Date("2026-01-01T00:01:00.000Z"),
    });
  });

  it("exhausts delivery at configured maximum without another retry", async () => {
    await expect(
      deliverWebhook(delivery(MAX_WEBHOOK_ATTEMPTS - 1), endpoint),
    ).resolves.toBe("exhausted");

    expect(mocks.updates[0]).toMatchObject({
      status: "exhausted",
      attempts: MAX_WEBHOOK_ATTEMPTS,
      nextRetryAt: null,
    });
  });
});
