import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({
  getWorkspaceContextOrNull: vi.fn(),
  read: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContextOrNull: mocks.getWorkspaceContextOrNull,
}));
vi.mock("@/lib/storage", () => ({
  storage: {
    read: mocks.read,
    put: mocks.put,
    delete: mocks.delete,
  },
}));
vi.mock("@/server/api/ratelimit", () => ({
  clientIp: () => "127.0.0.1",
  enforceRateLimit: mocks.enforceRateLimit,
}));

import { POST } from "./normalize/route";
import { GET } from "./route";

describe("storage image routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "workspace-1" },
    });
    mocks.read.mockResolvedValue(Buffer.from("placeholder"));
    mocks.put.mockResolvedValue(undefined);
    mocks.delete.mockResolvedValue(undefined);
    mocks.enforceRateLimit.mockResolvedValue(undefined);
  });

  it("stores a normalized logo and removes its temporary upload", async () => {
    const source = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect x="10" y="10" width="50" height="40" fill="#285"/></svg>',
    );
    mocks.read.mockResolvedValue(source);
    const request = new NextRequest("http://harly.test/api/storage/image/normalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "workspaces/workspace-1/images/temp/source.svg",
        mode: "logo",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();
    const writtenImage = mocks.put.mock.calls[0]?.[1] as Buffer;
    const metadata = await sharp(writtenImage).metadata();

    expect(response.status).toBe(200);
    expect(payload.contentType).toBe("image/png");
    expect(payload.fileUrl).toMatch(/^\/api\/storage\/image\?key=/);
    expect(metadata.format).toBe("png");
    expect(mocks.put).toHaveBeenCalledWith(
      expect.stringMatching(/^workspaces\/workspace-1\/images\/.+\.png$/),
      expect.any(Buffer),
      "image/png",
    );
    expect(mocks.delete).toHaveBeenCalledWith(
      "workspaces/workspace-1/images/temp/source.svg",
    );
  });

  it("serves only public workspace image keys with a stable image MIME type", async () => {
    mocks.read.mockResolvedValue(Buffer.from([1, 2, 3]));
    const request = new NextRequest(
      "http://harly.test/api/storage/image?key=workspaces/workspace-1/images/logo.png",
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toContain("immutable");
  });

  it("does not serve non-image storage namespaces", async () => {
    const request = new NextRequest(
      "http://harly.test/api/storage/image?key=workspaces/workspace-1/resumes/cv.pdf",
    );

    const response = await GET(request);

    expect(response.status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
