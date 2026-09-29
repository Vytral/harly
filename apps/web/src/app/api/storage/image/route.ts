import { NextResponse, type NextRequest } from "next/server";

import { isWorkspaceStorageKey } from "@/lib/storage-validation";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  const match = key?.match(/^workspaces\/([A-Za-z0-9_-]{1,128})\/images\//);
  if (!key || !match || !isWorkspaceStorageKey(match[1], key, "images")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) return new NextResponse("Not found", { status: 404 });

  try {
    const file = await storage.read(key);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
