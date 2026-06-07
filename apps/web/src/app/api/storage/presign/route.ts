import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import {
  createImageStorageKey,
  createResumeStorageKey,
  imageUploadRequestSchema,
  resumeUploadRequestSchema,
} from "@/lib/storage-validation";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { kind?: unknown };
  const kind = body?.kind === "image" ? "image" : "resume";

  const schema =
    kind === "image" ? imageUploadRequestSchema : resumeUploadRequestSchema;
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid upload request." },
      { status: 400 },
    );
  }

  const key =
    kind === "image"
      ? createImageStorageKey(parsed.data.filename)
      : createResumeStorageKey(parsed.data.filename);

  const result = await storage.getPresignedUploadUrl({
    key,
    contentType: parsed.data.contentType,
    contentLength: parsed.data.contentLength,
  });

  return NextResponse.json({ ...result, key });
}
