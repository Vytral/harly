import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { NextResponse, type NextRequest } from "next/server";
import { getLocalUploadPath } from "@harly/storage";

import {
  allowedImageContentTypes,
  allowedResumeContentTypes,
  maxImageFileSize,
  maxResumeFileSize,
} from "@/lib/storage-validation";
import { verifyStorageUploadIntent } from "@/lib/storage-upload-intent";
import { corsPreflight, withCors } from "@/server/api/respond";

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

  if (
    (!isResume && !isImage) ||
    !key.startsWith(`workspaces/${intent.workspaceId}/`)
  ) {
    return NextResponse.json({ error: "Invalid key." }, { status: 400 });
  }

  const allowedTypes = isImage
    ? allowedImageContentTypes
    : allowedResumeContentTypes;
  const maxSize = isImage ? maxImageFileSize : maxResumeFileSize;

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

export async function PUT(request: NextRequest) {
  return withCors(await handleUpload(request));
}

export async function POST(request: NextRequest) {
  return withCors(await handleUpload(request));
}

export function OPTIONS() {
  return corsPreflight();
}
