import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ del: vi.fn(), warn: vi.fn() }));

vi.mock("@/lib/storage", () => ({ storage: { delete: mocks.del } }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: mocks.warn, info: vi.fn(), error: vi.fn() }),
}));

import { deleteStorageObjects } from "./storage-cleanup";

describe("deleteStorageObjects", () => {
  beforeEach(() => {
    mocks.del.mockReset();
    mocks.warn.mockReset();
  });

  it("logs every failed delete with its storage key and returns the failed keys", async () => {
    mocks.del.mockImplementation(async (key: string) => {
      if (key.endsWith("b.pdf")) throw new Error("boom");
    });
    const failed = await deleteStorageObjects(
      ["workspaces/w/documents/a.pdf", "workspaces/w/documents/b.pdf"],
      { documentId: "doc-1" },
    );
    expect(failed).toEqual(["workspaces/w/documents/b.pdf"]);
    expect(mocks.warn).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        storageKey: "workspaces/w/documents/b.pdf",
        documentId: "doc-1",
      }),
      expect.any(String),
    );
  });

  it("does not log when everything is deleted", async () => {
    mocks.del.mockResolvedValue(undefined);
    await expect(deleteStorageObjects(["k"])).resolves.toEqual([]);
    expect(mocks.warn).not.toHaveBeenCalled();
  });
});
