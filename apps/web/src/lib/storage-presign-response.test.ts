import { describe, expect, it } from "vitest";

import { parseStoragePresignResponse } from "./storage-presign-response";

describe("parseStoragePresignResponse", () => {
  const presign = {
    uploadUrl: "https://harly.example/api/storage/upload?intent=signed",
    fileUrl: "/uploads/workspaces/workspace-1/images/photo.webp",
    key: "workspaces/workspace-1/images/photo.webp",
  };

  it("accepts the standard public API envelope", () => {
    expect(parseStoragePresignResponse({ data: presign })).toEqual(presign);
  });

  it("keeps accepting raw responses from authenticated upload routes", () => {
    expect(parseStoragePresignResponse(presign)).toEqual(presign);
  });

  it("rejects malformed responses", () => {
    expect(parseStoragePresignResponse({ data: { uploadUrl: 42 } })).toBeNull();
  });
});
