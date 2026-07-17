import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createStorageUploadIntent } from "@/lib/storage-upload-intent";
import { OPTIONS, PUT } from "./route";

const originalCwd = process.cwd();
const originalUploadsDir = process.env.UPLOADS_DIR;
const originalSecret = process.env.STORAGE_UPLOAD_SECRET;
let testRoot: string;

describe("local storage upload route", () => {
  beforeEach(async () => {
    testRoot = await mkdtemp(path.join(tmpdir(), "harly-upload-route-"));
    process.chdir(testRoot);
    process.env.UPLOADS_DIR = "uploads";
    process.env.STORAGE_UPLOAD_SECRET = "test-storage-upload-secret";
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalUploadsDir === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = originalUploadsDir;
    if (originalSecret === undefined) delete process.env.STORAGE_UPLOAD_SECRET;
    else process.env.STORAGE_UPLOAD_SECRET = originalSecret;
    await rm(testRoot, { recursive: true, force: true });
  });

  it("writes below a relative UPLOADS_DIR and allows cross-origin PUT", async () => {
    const key = "workspaces/workspace-1/images/file/photo.png";
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const intent = createStorageUploadIntent({
      workspaceId: "workspace-1",
      key,
      contentType: "image/png",
      contentLength: bytes.byteLength,
      expiresAt: Date.now() + 60_000,
    });
    const request = new NextRequest(
      `https://harly.example/api/storage/upload?key=${encodeURIComponent(key)}&intent=${encodeURIComponent(intent)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "image/png",
          Origin: "https://jobs.example",
        },
        body: bytes,
      },
    );

    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    await expect(
      readFile(path.join(testRoot, "uploads", ...key.split("/"))),
    ).resolves.toEqual(Buffer.from(bytes));
  });

  it("advertises PUT during CORS preflight", () => {
    expect(OPTIONS().headers.get("Access-Control-Allow-Methods")).toContain(
      "PUT",
    );
  });
});
