import { readFile } from "node:fs/promises";
import path from "node:path";

import { getLocalUploadPath } from "@harly/storage";
import { NextResponse } from "next/server";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { isPrivateResumeStorageKey } from "@/lib/upload-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const dynamicParams = true;

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

  // Resumes are private candidate data. They used to be served as public,
  // one-year immutable assets, which meant a leaked/guessed URL was enough to
  // read a CV and a browser/CDN could keep it after deletion.
  const isResume = isPrivateResumeStorageKey(storageKey);
  if (isResume) {
    const context = await getWorkspaceContextOrNull();
    if (!context) return new NextResponse("Not found", { status: 404 });

    // Keep the legacy URL compatible for recruiter-facing surfaces, but apply
    // the same candidate-data boundary as the authenticated storage route.
    // Returning 404 avoids revealing whether a protected object exists.
    try {
      await requirePermission("candidates:view");
    } catch {
      return new NextResponse("Not found", { status: 404 });
    }

    const workspaceMatch = storageKey.match(/^workspaces\/([^/]+)\//);
    if (workspaceMatch && workspaceMatch[1] !== context.organization.id) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  try {
    const file = await readFile(getLocalUploadPath(storageKey));
    const contentType =
      CONTENT_TYPES[path.extname(storageKey).toLowerCase()] ??
      "application/octet-stream";

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Cache-Control": isResume ? "private, no-store" : "public, max-age=31536000, immutable",
        "Content-Type": contentType,
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
