import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { NextResponse, type NextRequest } from "next/server";
import { getLocalUploadPath } from "@harly/storage";

import {
  allowedImageContentTypes,
  allowedDocumentContentTypes,
  allowedResumeContentTypes,
  maxDocumentFileSize,
  maxImageFileSize,
  maxResumeFileSize,
} from "@/lib/storage-validation";
import { verifyStorageUploadIntent } from "@/lib/storage-upload-intent";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { corsPreflight, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

async function handleUpload(request: NextRequest) {
  if (process.env.STORAGE_PROVIDER === "s3") {
    return NextResponse.json(
      { error: "Local uploads are disabled." },
      { status: 404 },
    );
  }

  const key = request.nextUrl.searchParams.get("key");
  const intent = verifyStorageUploadIntent(
    request.nextUrl.searchParams.get("intent"),
  );

  if (!key || !intent || key !== intent.key || key.includes("..")) {
    return NextResponse.json({ error: "Invalid key." }, { status: 400 });
  }

  const isResume = key.includes("/resumes/");
  const isImage = key.includes("/images/");
  const isDocument = key.includes("/documents/");

  if (
    (!isResume && !isImage && !isDocument) ||
    !key.startsWith(`workspaces/${intent.workspaceId}/`)
  ) {
    return NextResponse.json({ error: "Invalid key." }, { status: 400 });
  }

  const allowedTypes = isDocument
    ? allowedDocumentContentTypes
    : isImage
      ? allowedImageContentTypes
      : allowedResumeContentTypes;
  const maxSize = isDocument
    ? maxDocumentFileSize
    : isImage
      ? maxImageFileSize
      : maxResumeFileSize;

  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType !== intent.contentType ||
    !(allowedTypes as readonly string[]).includes(contentType)
  ) {
    return NextResponse.json(
      { error: "Unsupported file type." },
      { status: 400 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (
    !Number.isFinite(contentLength) ||
    contentLength > maxSize ||
    (contentLength > 0 && contentLength !== intent.contentLength)
  ) {
    return NextResponse.json({ error: "File too large." }, { status: 400 });
  }

  const fileBuffer = Buffer.from(await request.arrayBuffer());

  if (
    fileBuffer.byteLength > maxSize ||
    fileBuffer.byteLength !== intent.contentLength
  ) {
    return NextResponse.json({ error: "File too large." }, { status: 400 });
  }

  const uploadPath = getLocalUploadPath(key);
  await mkdir(dirname(uploadPath), { recursive: true });
  await writeFile(uploadPath, fileBuffer);

  return NextResponse.json({ ok: true });
}

async function rateLimitedUpload(request: Request) {
  await enforceRateLimit(`public:storage-upload:${clientIp(request)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  return handleUpload(request as NextRequest);
}

export const PUT = withApi(rateLimitedUpload, { cors: true });

export const POST = withApi(rateLimitedUpload, { cors: true });

export function OPTIONS() {
  return corsPreflight();
}
