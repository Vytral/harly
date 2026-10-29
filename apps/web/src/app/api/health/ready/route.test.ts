import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isReady: vi.fn(),
  getEmailOutboxHealth: vi.fn(),
}));

vi.mock("@/lib/readiness", () => ({
  isReady: mocks.isReady,
  harlyVersion: "0.3.0-test",
}));
vi.mock("@/lib/email/outbox-health", () => ({
  getEmailOutboxHealth: mocks.getEmailOutboxHealth,
}));
vi.mock("@/lib/logger", () => ({
  getServerLogger: () => ({ error: vi.fn(), warn: vi.fn() }),
}));

import { GET } from "./route";

const HEALTHY_EMAIL = { status: "ok", failed: 0, overduePending: 0, stuckProcessing: 0 } as const;
const WARNING_EMAIL = { status: "warning", failed: 3, overduePending: 1, stuckProcessing: 0 } as const;

describe("GET /api/health/ready", () => {
  beforeEach(() => {
    mocks.isReady.mockReset();
    mocks.getEmailOutboxHealth.mockReset();
  });

  it("returns 200 with the email detail when ready", async () => {
    mocks.isReady.mockResolvedValue(true);
    mocks.getEmailOutboxHealth.mockResolvedValue(HEALTHY_EMAIL);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", version: "0.3.0-test", email: HEALTHY_EMAIL });
  });

  it("never changes the status because of an email warning", async () => {
    mocks.isReady.mockResolvedValue(true);
    mocks.getEmailOutboxHealth.mockResolvedValue(WARNING_EMAIL);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", email: WARNING_EMAIL });
  });

  it("keeps 503 when not ready, and still reports the email detail", async () => {
    mocks.isReady.mockResolvedValue(false);
    mocks.getEmailOutboxHealth.mockResolvedValue(WARNING_EMAIL);

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable", version: "0.3.0-test", email: WARNING_EMAIL });
  });

  it("reports the email detail as unavailable when its lookup throws, without changing the status", async () => {
    mocks.isReady.mockResolvedValue(true);
    mocks.getEmailOutboxHealth.mockRejectedValue(new Error("relation email_outbox does not exist"));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", version: "0.3.0-test", email: { status: "unavailable" } });
  });

  it("stays 503 when the readiness probe itself throws", async () => {
    mocks.isReady.mockRejectedValue(new Error("connection refused"));
    mocks.getEmailOutboxHealth.mockRejectedValue(new Error("connection refused"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect((await response.json()).status).toBe("unavailable");
  });
});
