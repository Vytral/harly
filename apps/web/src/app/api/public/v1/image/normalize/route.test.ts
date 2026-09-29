import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  normalizeUploadedImage: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  storage: { read: mocks.read, put: mocks.put, delete: mocks.delete },
}));
vi.mock("@/lib/image-normalization", () => ({
  normalizeUploadedImage: mocks.normalizeUploadedImage,
  UnsupportedImageError: class UnsupportedImageError extends Error {},
}));
vi.mock("@/server/api/public", () => ({
  resolvePublicWorkspace: async () => ({ workspaceId: "ws-1", slug: "ws", key: null }),
}));
vi.mock("@/server/api/ratelimit", () => ({
  clientIp: () => "203.0.113.1",
  enforceRateLimit: async () => ({ remaining: 1 }),
}));

import { POST } from "./route";

const PUBLIC_KEY = "workspaces/ws-1/images/public-applications/abc/photo.png";

function request(key: string) {
  return new Request("http://harly.test/api/public/v1/image/normalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
}

describe("POST /api/public/v1/image/normalize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Storage behaves like a real bucket: the source exists until deleted.
    const objects = new Set([PUBLIC_KEY]);
    mocks.read.mockImplementation(async (key: string) => {
      if (!objects.has(key)) throw new Error("missing");
      return Buffer.from("source");
    });
    mocks.put.mockImplementation(async (key: string) => {
      objects.add(key);
    });
    mocks.delete.mockImplementation(async (key: string) => {
      objects.delete(key);
    });
    mocks.normalizeUploadedImage.mockResolvedValue({
      buffer: Buffer.from("out"),
      extension: "webp",
      contentType: "image/webp",
    });
  });

  it("consumes the temporary upload so resubmitting it cannot pile up copies", async () => {
    const first = await POST(request(PUBLIC_KEY));
    expect(first.status).toBe(200);
    const { key } = (await first.json()) as { key: string };
    expect(key.startsWith("workspaces/ws-1/images/public-applications/")).toBe(false);
    expect(mocks.delete).toHaveBeenCalledWith(PUBLIC_KEY);

    const again = await POST(request(PUBLIC_KEY));
    expect(again.status).toBe(404);
    const reuseOutput = await POST(request(key));
    expect(reuseOutput.status).toBe(404);
    expect(mocks.put).toHaveBeenCalledTimes(1);
  });

  it("refuses workspace assets outside the public upload area", async () => {
    const response = await POST(request("workspaces/ws-1/images/abc/logo.png"));

    expect(response.status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
