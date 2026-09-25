import "server-only";

import { privateResumeFileUrl } from "@/lib/resume/storage-key";
import { storage } from "@/lib/storage";
import {
  allowedResumeContentTypes,
  isWorkspaceStorageKey,
  maxResumeFileSize,
} from "@/lib/storage-validation";

type ResumeContentType = (typeof allowedResumeContentTypes)[number];

export type VerifiedResumeUpload = {
  key: string;
  fileUrl: string;
  fileName: string;
  fileType: ResumeContentType;
  fileSize: number;
};

function detectResumeContentType(bytes: Uint8Array): ResumeContentType | null {
  const prefix = Buffer.from(bytes.subarray(0, 8));
  if (prefix.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (
    prefix.length >= 4 &&
    prefix[0] === 0xd0 &&
    prefix[1] === 0xcf &&
    prefix[2] === 0x11 &&
    prefix[3] === 0xe0
  ) {
    return "application/msword";
  }
  if (prefix.subarray(0, 4).toString("ascii") === "PK\u0003\u0004") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

function extensionFor(fileName: string) {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

function extensionMatches(fileName: string, fileType: ResumeContentType) {
  const extension = extensionFor(fileName);
  const expected: Record<string, ResumeContentType> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return !expected[extension] || expected[extension] === fileType;
}

/**
 * Re-validates a resume at the application boundary. A key having the right
 * prefix is not enough: the object must exist, be a supported resume format,
 * and agree with any client-provided metadata. The returned URL is always
 * derived from the canonical key and never taken from the browser.
 */
export async function verifyResumeUpload(input: {
  workspaceId: string;
  key: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}): Promise<VerifiedResumeUpload | null> {
  if (!isWorkspaceStorageKey(input.workspaceId, input.key, "resumes")) {
    return null;
  }

  let bytes: Uint8Array;
  try {
    bytes = await storage.read(input.key);
  } catch {
    return null;
  }

  if (bytes.byteLength <= 0 || bytes.byteLength > maxResumeFileSize) {
    return null;
  }
  if (
    input.fileSize !== undefined &&
    (!Number.isSafeInteger(input.fileSize) || input.fileSize !== bytes.byteLength)
  ) {
    return null;
  }

  const detectedType = detectResumeContentType(bytes);
  if (!detectedType || !allowedResumeContentTypes.includes(detectedType)) {
    return null;
  }
  if (input.fileType && input.fileType !== detectedType) {
    return null;
  }

  const fileName = input.fileName?.trim() || input.key.split("/").pop() || "resume";
  if (!extensionMatches(fileName, detectedType)) {
    return null;
  }

  return {
    key: input.key,
    fileUrl: privateResumeFileUrl(input.key),
    fileName,
    fileType: detectedType,
    fileSize: bytes.byteLength,
  };
}
