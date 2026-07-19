import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  serialize: vi.fn((key: { id: string }) => ({ id: key.id })),
  actor: vi.fn(),
  reserve: vi.fn(),
  complete: vi.fn(),
  getRequestRateLimit: vi.fn(() => null),
}));

vi.mock("@/features/developers/data", () => ({
  createApiKey: mocks.create,
  listApiKeys: mocks.list,
  serializeApiKey: mocks.serialize,
}));
vi.mock("@/server/api/auth", () => ({
  authenticateApiKey: mocks.authenticate,
  hasApiScope: (scopes: string[], scope: string) => scopes.includes(scope),
  getRequestRateLimit: mocks.getRequestRateLimit,
}));
vi.mock("@/server/api/actor", () => ({
  resolveWorkspaceActorUserId: mocks.actor,
}));
vi.mock("@/server/api/idempotency", () => ({
  reserveIdempotencyKey: mocks.reserve,
  releaseIdempotencyReservation: vi.fn(async () => undefined),
}));
vi.mock("@/server/api/schemas", () => ({
  apiKeyCreateSchema: { parse: (value: unknown) => value },
}));

import { POST } from "./route";

describe("POST /api/v1/api-keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns raw key once but never persists it in idempotency data", async () => {
    mocks.authenticate.mockResolvedValue({
      workspaceId: "ws-1",
      keyId: "manager-key",
      createdById: "creator-1",
      type: "secret",
      environment: "test",
      scopes: ["api_keys:write", "jobs:read"],
    });
    mocks.actor.mockResolvedValue("creator-1");
    mocks.create.mockResolvedValue({
      key: { id: "new-key" },
      raw: "harly_sk_live_raw",
    });
    mocks.reserve.mockResolvedValue({
      kind: "reserved",
      key: "create-key-1",
      complete: mocks.complete,
    });

    const response = await POST(
      new Request("https://example.test/api/v1/api-keys", {
        method: "POST",
        headers: { "idempotency-key": "create-key-1" },
        body: JSON.stringify({
          name: "Integration",
          type: "secret",
          scopes: ["jobs:read"],
        }),
      }),
      undefined,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: { id: "new-key", key: "harly_sk_live_raw" },
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        createdById: "creator-1",
        name: "Integration",
        environment: "test",
      }),
    );
    expect(mocks.complete).toHaveBeenCalledWith({
      status: 201,
      body: { data: { id: "new-key" } },
    });
  });

  it("rejects publishable keys even when they claim management scope", async () => {
    mocks.authenticate.mockResolvedValue({
      workspaceId: "ws-1",
      keyId: "publishable-key",
      createdById: null,
      type: "publishable",
      environment: "test",
      scopes: ["api_keys:write", "jobs:read"],
    });

    const response = await POST(
      new Request("https://example.test/api/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: "Nope",
          type: "secret",
          scopes: ["jobs:read"],
        }),
      }),
      undefined,
    );

    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("cannot mint a key with scopes absent from caller", async () => {
    mocks.authenticate.mockResolvedValue({
      workspaceId: "ws-1",
      keyId: "limited-key",
      createdById: "creator-1",
      type: "secret",
      environment: "test",
      scopes: ["api_keys:write"],
    });
    mocks.actor.mockResolvedValue("creator-1");

    const response = await POST(
      new Request("https://example.test/api/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: "Escalation",
          type: "secret",
          scopes: ["jobs:write"],
        }),
      }),
      undefined,
    );

    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
