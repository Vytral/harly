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
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("HARLY_URL", "https://harly.example.com");
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

  it("uses the configured public origin instead of the proxy request origin", async () => {
    mocks.resolvePublicWorkspace.mockResolvedValue({ workspaceId: "workspace-1" });
    mocks.getPresignedUploadUrl.mockResolvedValue({
      uploadUrl: "/api/storage/upload?key=workspaces%2Fworkspace-1%2Fresumes%2Fresume.pdf",
      fileUrl: "/uploads/workspaces/workspace-1/resumes/resume.pdf",
    });
    const storageValidation = await import("@/lib/storage-validation");
    vi.mocked(storageValidation.createResumeStorageKey).mockReturnValue(
      "workspaces/workspace-1/resumes/resume.pdf",
    );
    const intent = await import("@/lib/storage-upload-intent");
    vi.mocked(intent.createStorageUploadIntent).mockReturnValue("signed-intent");
    vi.mocked(intent.appendStorageUploadIntent).mockReturnValue(
      "/api/storage/upload?key=workspaces%2Fworkspace-1%2Fresumes%2Fresume.pdf&intent=signed-intent",
    );
    const resumeStorageKey = await import("@/lib/resume/storage-key");
    vi.mocked(resumeStorageKey.privateResumeFileUrl).mockReturnValue(
      "/api/storage/private/resume.pdf",
    );
    vi.mocked(storageValidation.resumeUploadRequestSchema.safeParse).mockReturnValue({
      success: true,
      data: {
        filename: "resume.pdf",
        contentType: "application/pdf",
        contentLength: 4,
      },
    } as never);

    const response = await POST(
      new Request("https://0.0.0.0:3000/api/public/v1/resume/presign", {
        method: "POST",
        body: JSON.stringify({
          filename: "resume.pdf",
          contentType: "application/pdf",
          contentLength: 4,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.uploadUrl).toMatch(/^https:\/\/harly\.example\.com\//);
    expect(body.data.fileUrl).toBe("https://harly.example.com/api/storage/private/resume.pdf");
    expect(body.data.uploadUrl).not.toContain("0.0.0.0");
  });
});
