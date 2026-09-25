import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/server/api/auth", () => ({
  getRequestRateLimit: () => null,
}));
vi.mock("@/server/api/idempotency", () => ({
  releaseIdempotencyReservation: vi.fn(async () => undefined),
}));
vi.mock("@/server/observability/metrics", () => ({
  recordHttpError: vi.fn(),
  recordHttpRequest: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/server/api/ratelimit", () => ({
  clientIp: () => "203.0.113.10",
  enforceRateLimit: mocks.enforceRateLimit,
  rateLimitResultFromError: () => null,
}));

import { GET } from "./route";

describe("GET /embed/widget.js", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue({
      limit: 120,
      remaining: 119,
      resetAt: Date.now() + 60_000,
    });
  });

  it("ships the legal-consent payload contract for the public application form", async () => {
    const response = await GET(
      new Request("https://harly.example/embed/widget.js?pk=pk_test"),
    );
    const script = await response.text();

    expect(response.status).toBe(200);
    expect(script).toContain("legalConfigured");
    expect(script).toContain("consentText");
    expect(script).toContain("consentGiven");
    expect(script).toContain('consentInput.type = "checkbox"');
  });
});
