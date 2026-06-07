import { NextResponse, type NextRequest } from "next/server";

import {
  createResumeStorageKey,
  resumeUploadRequestSchema,
} from "@/lib/storage-validation";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsed = resumeUploadRequestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid upload request." },
      { status: 400 },
    );
  }

  const key = createResumeStorageKey(parsed.data.filename);
  const result = await storage.getPresignedUploadUrl({
    key,
    contentType: parsed.data.contentType,
    contentLength: parsed.data.contentLength,
  });

  return NextResponse.json({ ...result, key });
}
