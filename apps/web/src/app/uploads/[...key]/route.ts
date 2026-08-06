import { readFile } from "node:fs/promises";
import path from "node:path";

import { candidateFiles, db } from "@harly/db";
import { getLocalUploadPath } from "@harly/storage";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { requireCandidatePermission } from "@/features/workspaces/permissions-server";
import { isPrivateResumeStorageKey } from "@/lib/upload-access";
import { resumeKeyFromUrl } from "@/lib/resume/storage-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const dynamicParams = true;

const CONTENT_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function findCandidateFileForKey(workspaceId: string, key: string) {
  const rows = await db
    .select({ candidateId: candidateFiles.candidateId, fileUrl: candidateFiles.fileUrl })
    .from(candidateFiles)
    .where(eq(candidateFiles.workspaceId, workspaceId))
    .limit(5000);

  return rows.find((row) => resumeKeyFromUrl(row.fileUrl) === key) ?? null;
}

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

    // Keep legacy URLs compatible, but resolve every private key to a database
    // file before reading it. Legacy keys have no workspace segment, so the
    // workspace-scoped candidateFiles lookup is the tenant boundary.
    const candidateFile = await findCandidateFileForKey(
      context.organization.id,
      storageKey,
    );
    if (!candidateFile) return new NextResponse("Not found", { status: 404 });

    try {
      await requireCandidatePermission(
        "candidates:view",
        candidateFile.candidateId,
      );
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
        "X-Content-Type-Options": "nosniff",
        ...(path.extname(storageKey).toLowerCase() === ".svg"
          ? {
              "Content-Disposition": 'attachment; filename="asset.bin"',
              "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
            }
          : {}),
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
