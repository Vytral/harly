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
}));

import { normalizeStoredWorkspaceImage, StoredImageNotFoundError } from "./normalize-stored-image";

const LOGO_KEY = "workspaces/ws-1/images/abc/logo.png";
const PUBLIC_KEY = "workspaces/ws-1/images/public-applications/abc/photo.png";
const PUBLIC_PREFIX = "workspaces/ws-1/images/public-applications/";

describe("normalizeStoredWorkspaceImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue(Buffer.from("source"));
    mocks.put.mockResolvedValue(undefined);
    mocks.delete.mockResolvedValue(undefined);
    mocks.normalizeUploadedImage.mockResolvedValue({
      buffer: Buffer.from("out"),
      extension: "webp",
      contentType: "image/webp",
    });
  });

  it("keeps the source by default", async () => {
    await normalizeStoredWorkspaceImage({ workspaceId: "ws-1", key: LOGO_KEY, mode: "logo" });
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("deletes the source only when asked, after a successful conversion", async () => {
    await normalizeStoredWorkspaceImage({
      workspaceId: "ws-1",
      key: LOGO_KEY,
      mode: "logo",
      deleteSource: true,
    });
    expect(mocks.delete).toHaveBeenCalledWith(LOGO_KEY);
  });

  it("never deletes the source when conversion fails", async () => {
    mocks.normalizeUploadedImage.mockRejectedValue(new Error("pixel limit"));
    await expect(
      normalizeStoredWorkspaceImage({
        workspaceId: "ws-1",
        key: LOGO_KEY,
        mode: "logo",
        deleteSource: true,
      }),
    ).rejects.toThrow("pixel limit");
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("rejects keys outside the caller's allowed prefix", async () => {
    await expect(
      normalizeStoredWorkspaceImage({
        workspaceId: "ws-1",
        key: LOGO_KEY,
        mode: "image",
        keyPrefix: PUBLIC_PREFIX,
      }),
    ).rejects.toBeInstanceOf(StoredImageNotFoundError);
    expect(mocks.read).not.toHaveBeenCalled();

    await normalizeStoredWorkspaceImage({
      workspaceId: "ws-1",
      key: PUBLIC_KEY,
      mode: "image",
      keyPrefix: PUBLIC_PREFIX,
    });
    expect(mocks.put).toHaveBeenCalledOnce();
  });
});
