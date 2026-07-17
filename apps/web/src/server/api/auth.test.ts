import { describe, expect, it, vi } from "vitest";
import { ApiError, generateApiKey, hashApiKey } from "@harly/api";

const mocks = vi.hoisted(() => ({
  selectRows: [] as Record<string, unknown>[],
  enforceRateLimit: vi.fn(),
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
}));

import { authenticateApiKey } from "./auth";

function makeKey() {
  return generateApiKey({ type: "secret", environment: "test" });
}

function buildRequest(key: string) {
  return new Request("https://example.com/api", {
    headers: { authorization: `Bearer ${key}` },
  });
}

function dbRow(key: string, id: string) {
  return {
    id,
    workspaceId: "ws-1",
    type: "secret",
    environment: "test",
    scopes: ["candidates:read"],
    revokedAt: null,
    expiresAt: null,
    hashedKey: hashApiKey(key),
    lastUsedAt: null,
  };
}

describe("authenticateApiKey , per-key rate limit (F2-07)", () => {
  it("enforces a budget keyed to the API key id", async () => {
    const key = makeKey();
    mocks.selectRows = [dbRow(key.raw, "key-1")];
    mocks.enforceRateLimit.mockResolvedValue({ remaining: 999, resetAt: 0 });

    const ctx = await authenticateApiKey(buildRequest(key.raw));

    expect(ctx.keyId).toBe("key-1");
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      "apikey:key-1",
      expect.objectContaining({ limit: 1000, windowMs: 10 * 60_000 }),
    );
  });

  it("rejects authentication once the key's budget is exhausted", async () => {
    const key = makeKey();
    mocks.selectRows = [dbRow(key.raw, "key-2")];
    mocks.enforceRateLimit.mockImplementation(() => {
      throw ApiError.rateLimited("Rate limit exceeded. Slow down and try again shortly.");
    });

    await expect(authenticateApiKey(buildRequest(key.raw))).rejects.toThrow(ApiError);
  });
});
