import { readFile } from "node:fs/promises";
import path from "node:path";

import { getLocalUploadPath } from "@harly/storage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  if (process.env.STORAGE_PROVIDER === "s3") {
    return new NextResponse("Not found", { status: 404 });
  }

  const { key } = await params;
  const storageKey = key.join("/");
  if (!storageKey || storageKey.includes("..")) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const file = await readFile(getLocalUploadPath(storageKey));
    const contentType =
      CONTENT_TYPES[path.extname(storageKey).toLowerCase()] ??
      "application/octet-stream";

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentType,
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
