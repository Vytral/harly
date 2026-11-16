import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  resolvePortalSession: vi.fn(),
  getPresignedUploadUrl: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (m.cookie ? { value: m.cookie } : undefined),
  }),
}));
vi.mock("@/lib/portal-auth", () => ({
  PORTAL_SESSION_COOKIE: "portal",
  resolvePortalSession: m.resolvePortalSession,
}));
vi.mock("@/lib/storage", () => ({
  storage: { getPresignedUploadUrl: m.getPresignedUploadUrl },
  storageProvider: "s3",
}));
vi.mock("@/lib/storage-upload-intent", () => ({
  createStorageUploadIntent: () => "intent",
  appendStorageUploadIntent: (url: string) => url,
}));
vi.mock("@/server/api/ratelimit", () => ({
  enforceRateLimit: m.enforceRateLimit,
  rateLimitResultFromError: (e: unknown) =>
    (e as { rateLimit?: unknown })?.rateLimit ?? null,
}));

import { z } from "zod";

import { handlePortalPresign } from "./portal-presign";

const schema = z.object({
  filename: z.string(),
  contentType: z.string(),
  contentLength: z.number(),
});

function call(body: string) {
  return handlePortalPresign(
    new NextRequest("https://ats.example.test/api/portal/storage/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
    {
      schema,
      createKey: (ws, name) => `${ws}/${name}`,
      extra: (key) => ({ fileUrl: `private:${key}` }),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.cookie = "tok";
  m.resolvePortalSession.mockResolvedValue({ workspaceId: "ws1", candidateId: "c1" });
  m.getPresignedUploadUrl.mockResolvedValue({ uploadUrl: "https://s3.example.test/u" });
  m.enforceRateLimit.mockResolvedValue({ limit: 30, remaining: 29, resetAt: 0 });
});

describe("handlePortalPresign", () => {
  it("is 401 without a portal session", async () => {
    m.cookie = undefined;
    const res = await call("{}");
    expect(res.status).toBe(401);
    expect(m.getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("is 400 (not 500) for malformed JSON", async () => {
    const res = await call("{not json");
    expect(res.status).toBe(400);
    expect(m.getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("is 400 for a body that fails validation", async () => {
    const res = await call(JSON.stringify({ filename: 1 }));
    expect(res.status).toBe(400);
  });

  it("is 429 with Retry-After when the candidate exceeds the budget", async () => {
    m.enforceRateLimit.mockRejectedValue({
      rateLimit: { limit: 30, remaining: 0, resetAt: Date.now() + 5_000 },
    });
    const res = await call(
      JSON.stringify({ filename: "cv.pdf", contentType: "application/pdf", contentLength: 10 }),
    );
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(m.getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("presigns for the session workspace and merges extra fields", async () => {
    const res = await call(
      JSON.stringify({ filename: "cv.pdf", contentType: "application/pdf", contentLength: 10 }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.key).toBe("ws1/cv.pdf");
    expect(json.fileUrl).toBe("private:ws1/cv.pdf");
    expect(m.enforceRateLimit).toHaveBeenCalledWith(
      "portal:presign:ws1:c1",
      expect.objectContaining({ limit: 30 }),
    );
  });
});
