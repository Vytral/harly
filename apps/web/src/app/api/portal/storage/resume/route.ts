import { type NextRequest } from "next/server";

import { handlePortalPresign } from "@/lib/portal-presign";
import { privateResumeFileUrl } from "@/lib/resume/storage-key";
import {
  createResumeStorageKey,
  resumeUploadRequestSchema,
} from "@/lib/storage-validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handlePortalPresign(request, {
    schema: resumeUploadRequestSchema,
    createKey: createResumeStorageKey,
    extra: (key) => ({ fileUrl: privateResumeFileUrl(key) }),
  });
}
