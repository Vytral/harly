import { describe, expect, it, vi } from "vitest";
import { ApiError, generateApiKey, hashApiKey } from "@harly/api";

const mocks = vi.hoisted(() => ({
  selectRows: [] as Record<string, unknown>[],
  enforceRateLimit: vi.fn(),
  rateLimitResultFromError: vi.fn(() => null),
}));

vi.mock("@harly/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({ where: () => ({ limit: async () => mocks.selectRows }) }),
    })),
    update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve() }) })),
  },
  apiKeys: {},
}));
vi.mock("@/server/api/ratelimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  rateLimitResultFromError: mocks.rateLimitResultFromError,
}));

import { authenticateApiKey, requireScope as requireApiScope } from "./auth";

function makeKey() {
  return generateApiKey({ type: "secret", environment: "test" });
}

function buildRequest(key: string) {
  return new Request("https://example.com/api", {
    headers: { authorization: `Bearer ${key}` },
  });
}

function dbRow(key: string, id: string, scopes = ["candidates:read"]) {
  return {
    id,
    workspaceId: "ws-1",
    type: "secret",
    environment: "test",
    scopes,
    revokedAt: null,
    expiresAt: null,
    createdById: "user-key-creator",
    hashedKey: hashApiKey(key),
    lastUsedAt: null,
  };
}

describe("authenticateApiKey , per-key rate limit (F2-07)", () => {
  it("enforces a budget keyed to the API key id", async () => {
    const key = makeKey();
    mocks.selectRows = [dbRow(key.raw, "key-1")];
    mocks.enforceRateLimit.mockResolvedValue({
      limit: 1000,
      remaining: 999,
      resetAt: 0,
    });

    const ctx = await authenticateApiKey(buildRequest(key.raw));

    expect(ctx.keyId).toBe("key-1");
    expect(ctx.createdById).toBe("user-key-creator");
    expect(ctx.rateLimit).toEqual({ limit: 1000, remaining: 999, resetAt: 0 });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      "apikey:key-1",
      expect.objectContaining({ limit: 1000, windowMs: 10 * 60_000 }),
    );
  });

  it("rejects authentication once the key's budget is exhausted", async () => {
    const key = makeKey();
    mocks.selectRows = [dbRow(key.raw, "key-2")];
    mocks.enforceRateLimit.mockRejectedValue(
      ApiError.rateLimited(
        "Rate limit exceeded. Slow down and try again shortly.",
      ),
    );

    await expect(authenticateApiKey(buildRequest(key.raw))).rejects.toThrow(
      ApiError,
    );
  });

  it("accepts legacy webhooks:manage for split webhook scopes", async () => {
    const key = makeKey();
    mocks.selectRows = [dbRow(key.raw, "key-webhooks", ["webhooks:manage"])];
    mocks.enforceRateLimit.mockResolvedValue({
      limit: 1000,
      remaining: 999,
      resetAt: 0,
    });

    await expect(
      authenticateApiKey(buildRequest(key.raw), "webhooks:read"),
    ).resolves.toMatchObject({ keyId: "key-webhooks" });
  });
});

describe("requireScope webhook legacy compatibility", () => {
  it("accepts webhooks:manage for split webhook scopes only", () => {
    const context = {
      workspaceId: "ws-1",
      keyId: "key-1",
      createdById: null,
      type: "secret" as const,
      environment: "test" as const,
      scopes: ["webhooks:manage"] as ["webhooks:manage"],
      rateLimit: { limit: 1000, remaining: 999, resetAt: 0 },
    };

    expect(() => requireApiScope(context, "webhooks:read")).not.toThrow();
    expect(() => requireApiScope(context, "webhooks:write")).not.toThrow();
    expect(() => requireApiScope(context, "jobs:read")).toThrow(ApiError);
  });
});
