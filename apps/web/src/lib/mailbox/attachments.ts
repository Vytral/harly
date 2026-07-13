import { sanitizeFilename } from "@/lib/storage-validation";

export const maxMailboxAttachmentSize = 25 * 1024 * 1024;

const allowedMailboxAttachmentTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function validateMailboxAttachment(input: {
  filename?: string;
  contentType?: string;
  size: number;
}):
  | { ok: true; filename: string; contentType: string }
  | { ok: false; error: string } {
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    return { ok: false, error: "Attachment is empty or invalid." };
  }
  if (input.size > maxMailboxAttachmentSize) {
    return { ok: false, error: "Attachment exceeds the 25MB limit." };
  }
  const contentType = input.contentType?.toLowerCase().trim() ?? "";
  if (!allowedMailboxAttachmentTypes.has(contentType)) {
    return { ok: false, error: "Unsupported attachment type." };
  }
  // `sanitizeFilename` neutralizes path separators; remove traversal-looking
  // remnants as well so names are harmless in logs and content-disposition.
  const filename = sanitizeFilename(input.filename || "attachment")
    .replace(/(^|[-_])\.\.(?=[-_]|$)/g, "$1")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "attachment";
  return {
    ok: true,
    filename,
    contentType,
  };
}
