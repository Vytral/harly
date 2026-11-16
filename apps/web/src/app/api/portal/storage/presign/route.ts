import { type NextRequest } from "next/server";

import { handlePortalPresign } from "@/lib/portal-presign";
import {
  createImageStorageKey,
  imageUploadRequestSchema,
} from "@/lib/storage-validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handlePortalPresign(request, {
    schema: imageUploadRequestSchema,
    createKey: createImageStorageKey,
  });
}
