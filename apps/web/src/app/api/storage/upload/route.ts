import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import {
  allowedImageContentTypes,
  allowedResumeContentTypes,
  maxImageFileSize,
  maxResumeFileSize,
} from "@/lib/storage-validation";

export const runtime = "nodejs";

function getUploadsRoot() {
  return process.env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads");
}

function getUploadPath(key: string) {
  const uploadsRoot = getUploadsRoot();
  const resolvedPath = path.resolve(uploadsRoot, key);

  if (!resolvedPath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error("Invalid storage key.");
  }

  return resolvedPath;
}

async function handleUpload(request: NextRequest) {
  if (process.env.STORAGE_PROVIDER === "s3") {
    return NextResponse.json(
      { error: "Local uploads are disabled." },
      { status: 404 },
    );
  }

  const key = request.nextUrl.searchParams.get("key");

  if (!key || key.includes("..")) {
    return NextResponse.json({ error: "Invalid key." }, { status: 400 });
  }

  const isResume = key.startsWith("resumes/");
  const isImage = key.startsWith("images/");

  if (!isResume && !isImage) {
    return NextResponse.json({ error: "Invalid key." }, { status: 400 });
  }

  const allowedTypes = isImage
    ? allowedImageContentTypes
    : allowedResumeContentTypes;
  const maxSize = isImage ? maxImageFileSize : maxResumeFileSize;

  const contentType = request.headers.get("content-type") ?? "";

  if (!(allowedTypes as readonly string[]).includes(contentType)) {
    return NextResponse.json(
      { error: "Unsupported file type." },
      { status: 400 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (!Number.isFinite(contentLength) || contentLength > maxSize) {
    return NextResponse.json({ error: "File too large." }, { status: 400 });
  }

  const fileBuffer = Buffer.from(await request.arrayBuffer());

  if (fileBuffer.byteLength > maxSize) {
    return NextResponse.json({ error: "File too large." }, { status: 400 });
  }

  const uploadPath = getUploadPath(key);
  await mkdir(path.dirname(uploadPath), { recursive: true });
  await writeFile(uploadPath, fileBuffer);

  return NextResponse.json({ ok: true });
}

export async function PUT(request: NextRequest) {
  return handleUpload(request);
}

export async function POST(request: NextRequest) {
  return handleUpload(request);
}
