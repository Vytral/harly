import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@harly/db", () => ({
  db: {},
  apiKeys: {},
  webhookDeliveries: {},
  webhookDeliveryAttempts: {},
  webhookEndpoints: {},
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/server/api/auth", () => ({
  hasApiScope: (scopes: string[], scope: string) => scopes.includes(scope),
}));
vi.mock("@/lib/crypto", () => ({ encryptSecret: vi.fn() }));
vi.mock("@/lib/ssrf", () => ({ validateWebhookUrl: vi.fn() }));
vi.mock("@/server/webhooks/dispatch", () => ({ dispatchDueWebhooks: vi.fn() }));

import {
  assertDeveloperAccess,
  createApiKey,
  deleteWebhookEndpoint,
  replayWebhookDelivery,
  revokeApiKey,
} from "./data";

const key = (over: Record<string, unknown> = {}) => ({
  workspaceId: "ws-1",
  type: "secret" as const,
  scopes: ["api_keys:write", "webhooks:write"] as never,
  ...over,
});

describe("assertDeveloperAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a key of the same workspace with the scope", async () => {
    await expect(
      assertDeveloperAccess("ws-1", "webhooks:write", key()),
    ).resolves.toBeUndefined();
  });

  it("rejects another workspace, a missing scope and a publishable key for api keys", async () => {
    await expect(
      assertDeveloperAccess("ws-2", "webhooks:write", key()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      assertDeveloperAccess("ws-1", "webhooks:write", key({ scopes: ["webhooks:read"] })),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      assertDeveloperAccess("ws-1", "api_keys:write", key({ type: "publishable" })),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("without a key requires integrations:manage in the same workspace", async () => {
    mocks.requirePermission.mockResolvedValue({ organization: { id: "ws-1" } });
    await expect(assertDeveloperAccess("ws-1", "webhooks:write")).resolves.toBeUndefined();
    expect(mocks.requirePermission).toHaveBeenCalledWith("integrations:manage");

    await expect(assertDeveloperAccess("ws-2", "webhooks:write")).rejects.toMatchObject({ status: 403 });

    mocks.requirePermission.mockRejectedValue(new Error("no session"));
    await expect(assertDeveloperAccess("ws-1", "webhooks:write")).rejects.toMatchObject({ status: 403 });
  });

  it("guards the data functions before touching the database", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("no permission"));
    await expect(
      createApiKey({ workspaceId: "ws-1", name: "k", type: "secret", scopes: ["jobs:read"] }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(revokeApiKey({ workspaceId: "ws-1", keyId: "k" })).rejects.toMatchObject({ status: 403 });
    await expect(deleteWebhookEndpoint({ workspaceId: "ws-1", id: "w" })).rejects.toMatchObject({ status: 403 });
    await expect(
      replayWebhookDelivery({ workspaceId: "ws-1", endpointId: "w", deliveryId: "d" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
