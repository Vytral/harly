import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getRolePermissions: vi.fn(),
  createApiKey: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@harly/db", () => ({ db: {}, webhookDeliveries: {} }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/server/webhooks/dispatch", () => ({ dispatchDueWebhooks: vi.fn() }));
vi.mock("@/features/demo/assert-not-demo", () => ({ assertNotDemo: vi.fn() }));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
  getRolePermissions: mocks.getRolePermissions,
}));
vi.mock("@/features/developers/data", () => ({
  createApiKey: mocks.createApiKey,
  createWebhookEndpoint: vi.fn(),
  deleteWebhookEndpoint: vi.fn(),
  getWebhookEndpoint: vi.fn(),
  listWebhookDeliveries: vi.fn(),
  replayWebhookDelivery: vi.fn(),
  revokeApiKey: vi.fn(),
  rotateWebhookSecret: vi.fn(),
  serializeDelivery: vi.fn(),
  updateWebhookEndpoint: vi.fn(),
}));

import { createApiKeyAction } from "./actions";

describe("createApiKeyAction scope ceiling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({
      organization: { id: "ws-1" },
      user: { id: "user-1" },
      roleKey: "integrations-only",
    });
    mocks.getRolePermissions.mockResolvedValue(["integrations:manage", "jobs:view"]);
    mocks.createApiKey.mockResolvedValue({ raw: "harly_sk_live_test" });
  });

  it("refuses a scope the creator's role does not cover, and creates nothing", async () => {
    const result = await createApiKeyAction({
      name: "Escalated",
      type: "secret",
      scopes: ["candidates:write"],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/candidates:write/);
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });

  it("refuses when only one of several requested scopes is outside the role", async () => {
    const result = await createApiKeyAction({
      name: "Mixed",
      type: "secret",
      scopes: ["jobs:read", "applications:write"],
    });

    expect(result.ok).toBe(false);
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });

  it("creates the key when every requested scope is covered", async () => {
    const result = await createApiKeyAction({
      name: "Read only",
      type: "secret",
      scopes: ["jobs:read"],
    });

    expect(result).toMatchObject({ ok: true, raw: "harly_sk_live_test" });
    expect(mocks.createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", scopes: ["jobs:read"] }),
    );
  });
});
