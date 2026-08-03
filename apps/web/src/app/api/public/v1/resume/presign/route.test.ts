import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  resolvePublicWorkspace: vi.fn(),
  getPresignedUploadUrl: vi.fn(),
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
vi.mock("@/server/api/public", () => ({
  resolvePublicWorkspace: mocks.resolvePublicWorkspace,
}));
vi.mock("@/server/api/ratelimit", () => ({
  clientIp: () => "203.0.113.10",
  enforceRateLimit: mocks.enforceRateLimit,
  rateLimitResultFromError: () => null,
}));
vi.mock("@/lib/storage-validation", () => ({
  createResumeStorageKey: vi.fn(),
  resumeUploadRequestSchema: { safeParse: vi.fn() },
}));
vi.mock("@/lib/storage", () => ({
  storageProvider: "local",
  storage: { getPresignedUploadUrl: mocks.getPresignedUploadUrl },
}));
vi.mock("@/lib/resume/storage-key", () => ({
  privateResumeFileUrl: vi.fn(),
}));
vi.mock("@/lib/storage-upload-intent", () => ({
  appendStorageUploadIntent: vi.fn(),
  createStorageUploadIntent: vi.fn(),
}));

import { ApiError } from "@harly/api";
import { POST } from "./route";

describe("POST /api/public/v1/resume/presign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue({
      limit: 20,
      remaining: 19,
      resetAt: Date.now() + 60_000,
    });
  });

  it("returns 429 before resolving a workspace when the quota is exhausted", async () => {
    mocks.enforceRateLimit.mockRejectedValue(ApiError.rateLimited());

    const response = await POST(
      new Request("https://harly.example/api/public/v1/resume/presign", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: { code: "rate_limited" },
    });
    expect(mocks.resolvePublicWorkspace).not.toHaveBeenCalled();
  });
});
