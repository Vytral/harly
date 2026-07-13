import { afterEach, describe, expect, it } from "vitest";

import {
  createStorageUploadIntent,
  verifyStorageUploadIntent,
} from "./storage-upload-intent";

const originalSecret = process.env.STORAGE_UPLOAD_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.STORAGE_UPLOAD_SECRET;
  else process.env.STORAGE_UPLOAD_SECRET = originalSecret;
});

describe("storage upload intents", () => {
  it("binds an upload to its workspace, key, type and size", () => {
    process.env.STORAGE_UPLOAD_SECRET = "test-storage-upload-secret";
    const intent = createStorageUploadIntent({
      workspaceId: "workspace-a",
      key: "workspaces/workspace-a/resumes/file/resume.pdf",
      contentType: "application/pdf",
      contentLength: 42,
      expiresAt: Date.now() + 60_000,
    });

    expect(verifyStorageUploadIntent(intent)).toMatchObject({
      workspaceId: "workspace-a",
      key: "workspaces/workspace-a/resumes/file/resume.pdf",
      contentType: "application/pdf",
      contentLength: 42,
    });
  });

  it("rejects a tampered intent", () => {
    process.env.STORAGE_UPLOAD_SECRET = "test-storage-upload-secret";
    const intent = createStorageUploadIntent({
      workspaceId: "workspace-a",
      key: "workspaces/workspace-a/resumes/file/resume.pdf",
      contentType: "application/pdf",
      contentLength: 42,
      expiresAt: Date.now() + 60_000,
    });

    expect(verifyStorageUploadIntent(`${intent}x`)).toBeNull();
  });

  it("rejects an expired intent", () => {
    process.env.STORAGE_UPLOAD_SECRET = "test-storage-upload-secret";
    const intent = createStorageUploadIntent({
      workspaceId: "workspace-a",
      key: "workspaces/workspace-a/resumes/file/resume.pdf",
      contentType: "application/pdf",
      contentLength: 42,
      expiresAt: Date.now() - 1,
    });

    expect(verifyStorageUploadIntent(intent)).toBeNull();
  });
});
