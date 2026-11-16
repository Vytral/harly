import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@harly/api";

const m = vi.hoisted(() => ({ enforce: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/server/api/ratelimit", async () => {
  const actual = await vi.importActual<typeof import("@/server/api/ratelimit")>(
    "@/server/api/ratelimit",
  );
  return {
    clientIp: () => "203.0.113.1",
    rateLimitResultFromError: actual.rateLimitResultFromError,
    enforcePersistentRateLimit: m.enforce,
  };
});

import { passesPortalRateLimit, pseudonymize } from "./portal-rate-limit";

function rateLimited() {
  return new ApiError("rate_limited", "Rate limit exceeded.", {
    rateLimit: { limit: 1, remaining: 0, resetAt: Date.now() + 1000 },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("passesPortalRateLimit", () => {
  it("is true while every tier has room", async () => {
    m.enforce.mockResolvedValue({ limit: 5, remaining: 4, resetAt: 0 });
    expect(await passesPortalRateLimit("k", [{ limit: 5, windowMs: 1000 }])).toBe(true);
  });

  it("is false when a tier is exhausted", async () => {
    m.enforce.mockRejectedValue(rateLimited());
    expect(await passesPortalRateLimit("k", [{ limit: 1, windowMs: 1000 }])).toBe(false);
  });

  it("does not report a database failure as rate limiting", async () => {
    m.enforce.mockRejectedValue(new Error("connect ECONNREFUSED"));
    await expect(
      passesPortalRateLimit("k", [{ limit: 1, windowMs: 1000 }]),
    ).rejects.toThrow("ECONNREFUSED");
  });
});

describe("pseudonymize", () => {
  it("refuses to run in production without a secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.AI_ENCRYPTION_KEY;
    expect(() => pseudonymize("ip:1.2.3.4")).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("is a stable keyed hash when a secret is set", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-value");
    expect(pseudonymize("a")).toBe(pseudonymize("a"));
    expect(pseudonymize("a")).not.toBe(pseudonymize("b"));
  });
});
