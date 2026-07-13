import { z } from "zod";

export const maxResumeFileSize = 10 * 1024 * 1024;

export const allowedResumeContentTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const resumeUploadRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(allowedResumeContentTypes),
  contentLength: z.number().int().positive().max(maxResumeFileSize),
});

export type ResumeUploadRequest = z.infer<typeof resumeUploadRequestSchema>;

export function sanitizeFilename(filename: string) {
  const sanitized = filename
    .trim()
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._ -]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "resume";
}

export function getResumeFileValidationError(file: File) {
  if (
    !allowedResumeContentTypes.includes(
      file.type as (typeof allowedResumeContentTypes)[number],
    )
  ) {
    return "Upload a PDF, DOC, or DOCX resume.";
  }

  if (file.size > maxResumeFileSize) {
    return "Resume must be 10MB or smaller.";
  }

  if (file.size <= 0) {
    return "Resume is required.";
  }

  return null;
}

function workspacePrefix(workspaceId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId)) {
    throw new Error("Invalid workspace storage namespace.");
  }
  return `workspaces/${workspaceId}`;
}

export function isWorkspaceStorageKey(
  workspaceId: string,
  key: string,
  kind: "resumes" | "images",
) {
  return key.startsWith(`${workspacePrefix(workspaceId)}/${kind}/`) && !key.includes("..");
}

export function createResumeStorageKey(workspaceId: string, filename: string) {
  return `${workspacePrefix(workspaceId)}/resumes/${crypto.randomUUID()}/${sanitizeFilename(filename)}`;
}

// Images (workspace logo / banner). Smaller cap than resumes.
export const maxImageFileSize = 5 * 1024 * 1024;

export const allowedImageContentTypes = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
] as const;

export const imageUploadRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(allowedImageContentTypes),
  contentLength: z.number().int().positive().max(maxImageFileSize),
});

export type ImageUploadRequest = z.infer<typeof imageUploadRequestSchema>;

export function getImageFileValidationError(file: File) {
  if (
    !allowedImageContentTypes.includes(
      file.type as (typeof allowedImageContentTypes)[number],
    )
  ) {
    return "Upload a PNG, JPG, SVG, or WEBP image.";
  }

  if (file.size > maxImageFileSize) {
    return "Image must be 5MB or smaller.";
  }

  if (file.size <= 0) {
    return "Image is required.";
  }

  return null;
}

export function createImageStorageKey(workspaceId: string, filename: string) {
  return `${workspacePrefix(workspaceId)}/images/${crypto.randomUUID()}/${sanitizeFilename(filename)}`;
}

export function createPublicApplicationImageStorageKey(
  workspaceId: string,
  filename: string,
) {
  return `${workspacePrefix(workspaceId)}/images/public-applications/${crypto.randomUUID()}/${sanitizeFilename(filename)}`;
}
