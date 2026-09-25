import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  storage: { read: mocks.read },
}));

import { privateResumeFileUrl } from "@/lib/resume/storage-key";
import { verifyResumeUpload } from "./resume-upload";

describe("verifyResumeUpload", () => {
  beforeEach(() => {
    mocks.read.mockReset();
  });

  it("requires an existing canonical object and returns server-owned metadata", async () => {
    const bytes = Buffer.from("%PDF-1.7\nresume");
    mocks.read.mockResolvedValue(bytes);

    await expect(
      verifyResumeUpload({
        workspaceId: "workspace_1",
        key: "workspaces/workspace_1/resumes/upload/cv.pdf",
        fileName: "cv.pdf",
        fileType: "application/pdf",
        fileSize: bytes.byteLength,
      }),
    ).resolves.toEqual({
      key: "workspaces/workspace_1/resumes/upload/cv.pdf",
      fileUrl: privateResumeFileUrl(
        "workspaces/workspace_1/resumes/upload/cv.pdf",
      ),
      fileName: "cv.pdf",
      fileType: "application/pdf",
      fileSize: bytes.byteLength,
    });
  });

  it("rejects a missing object or forged metadata", async () => {
    mocks.read.mockRejectedValueOnce(new Error("not found"));
    await expect(
      verifyResumeUpload({
        workspaceId: "workspace_1",
        key: "workspaces/workspace_1/resumes/upload/cv.pdf",
      }),
    ).resolves.toBeNull();

    mocks.read.mockResolvedValueOnce(Buffer.from("%PDF-1.7\nresume"));
    await expect(
      verifyResumeUpload({
        workspaceId: "workspace_1",
        key: "workspaces/workspace_1/resumes/upload/cv.pdf",
        fileType: "application/msword",
        fileSize: 999,
      }),
    ).resolves.toBeNull();
  });

  it("rejects a key outside the workspace resume namespace", async () => {
    await expect(
      verifyResumeUpload({
        workspaceId: "workspace_1",
        key: "https://attacker.example/cv.pdf",
      }),
    ).resolves.toBeNull();
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
