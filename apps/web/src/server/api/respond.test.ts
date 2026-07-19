import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@harly/api";
import { NextResponse } from "next/server";

const quota = { limit: 1000, remaining: 999, resetAt: 1_700_000_000_000 };
const mocks = vi.hoisted(() => ({
  getRequestRateLimit: vi.fn(),
  rateLimitResultFromError: vi.fn(),
}));

vi.mock("@/server/api/auth", () => ({
  getRequestRateLimit: mocks.getRequestRateLimit,
}));
vi.mock("@/server/api/ratelimit", () => ({
  rateLimitResultFromError: mocks.rateLimitResultFromError,
}));

import { withApi } from "./respond";

describe("withApi rate-limit headers", () => {
  it("adds standard quota headers after authenticated success", async () => {
    mocks.getRequestRateLimit.mockReturnValue(quota);
    const request = new Request("https://example.test/api/v1/jobs");
    const response = await withApi(async () => NextResponse.json({ data: {} }))(
      request,
      undefined,
    );

    expect(response.headers.get("X-RateLimit-Limit")).toBe("1000");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("999");
    expect(response.headers.get("X-RateLimit-Reset")).toBe("1700000000");
  });

  it("adds quota and Retry-After headers to rate-limit rejections", async () => {
    const exhausted = { ...quota, remaining: 0, resetAt: Date.now() + 10_000 };
    mocks.getRequestRateLimit.mockReturnValue(null);
    mocks.rateLimitResultFromError.mockReturnValue(exhausted);
    const response = await withApi(async () => {
      throw ApiError.rateLimited();
    })(new Request("https://example.test/api/v1/jobs"), undefined);

    expect(response.status).toBe(429);
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("Retry-After")).toMatch(/^\d+$/);
  });
});
