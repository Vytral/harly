import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { extractResumeText } from "@/lib/resume/extract-text";
import { resumeKeyFromUrl } from "@/lib/resume/storage-key";
import { safeFetchHttp } from "@/lib/ssrf";
import { storage } from "@/lib/storage";
import {
  allowedResumeContentTypes,
  createResumeStorageKey,
  isWorkspaceStorageKey,
  maxResumeFileSize,
} from "@/lib/storage-validation";
import { verifyResumeUpload } from "@/features/applications/resume-upload";

import { McpToolError } from "../../types";

// Resume intake for candidates_create / candidates_attach_resume. A resume is
// accepted as a base64 payload or a public https URL and goes through the same
// rules as the browser upload: PDF/DOC/DOCX only, at most 10 MB, content sniffed
// from the bytes, stored under the workspace's resume prefix.

export type ResumeContentType = (typeof allowedResumeContentTypes)[number];

const TYPE_BY_EXTENSION: Record<string, ResumeContentType> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const MAX_REDIRECTS = 3;
const DOWNLOAD_TIMEOUT_MS = 15_000;

export const resumeInputSchema = z
  .object({
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .describe("File name with extension (.pdf, .doc or .docx), e.g. 'Ana-Lopez-CV.pdf'. The extension decides the expected format."),
    url: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .describe("Public https:// link Harly downloads the file from (no credentials in the URL, max 10 MB). Provide url or base64, not both."),
    base64: z
      .string()
      .max(Math.ceil((maxResumeFileSize * 4) / 3) + 16)
      .optional()
      .describe("The file bytes, base64 encoded (max 10 MB decoded). Provide base64 or url, not both."),
  })
  .refine((value) => Boolean(value.url) !== Boolean(value.base64), {
    message: "Provide exactly one of url or base64.",
  });

export type ResumeInput = z.infer<typeof resumeInputSchema>;

export function resumeTypeForFileName(fileName: string): ResumeContentType {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const type = TYPE_BY_EXTENSION[extension];
  if (!type) {
    throw new McpToolError("Resume must be a .pdf, .doc or .docx file.", "invalid_input");
  }
  return type;
}

/** Content type from the file's magic bytes, or null when it is not a supported resume. */
export function sniffResumeType(bytes: Uint8Array): ResumeContentType | null {
  const prefix = Buffer.from(bytes.subarray(0, 8));
  if (prefix.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (prefix.length >= 4 && prefix[0] === 0xd0 && prefix[1] === 0xcf && prefix[2] === 0x11 && prefix[3] === 0xe0) {
    return "application/msword";
  }
  if (prefix.subarray(0, 4).toString("ascii") === "PK\u0003\u0004") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

export function decodeBase64Resume(payload: string): Buffer {
  // Accept data: URLs and wrapped lines, which models often produce.
  const raw = payload.replace(/^data:[^;,]*;base64,/i, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 === 1) {
    throw new McpToolError("base64 is not valid.", "invalid_input");
  }
  const buffer = Buffer.from(raw, "base64");
  if (buffer.byteLength === 0) throw new McpToolError("The resume file is empty.", "invalid_input");
  if (buffer.byteLength > maxResumeFileSize) {
    throw new McpToolError("Resume must be 10MB or smaller.", "invalid_input");
  }
  return buffer;
}

function assertDownloadableUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new McpToolError("url is not a valid URL.", "invalid_input");
  }
  if (parsed.protocol !== "https:") throw new McpToolError("url must start with https://", "invalid_input");
  if (parsed.username || parsed.password) {
    throw new McpToolError("url cannot contain credentials.", "invalid_input");
  }
  return parsed;
}

async function readCapped(response: Response): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxResumeFileSize) {
    throw new McpToolError("Resume must be 10MB or smaller.", "invalid_input");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new McpToolError("The URL returned no content.", "invalid_input");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxResumeFileSize) {
      await reader.cancel();
      throw new McpToolError("Resume must be 10MB or smaller.", "invalid_input");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

/** SSRF-safe download: https only, pinned DNS, redirects re-validated, size capped. */
export async function downloadResume(url: string): Promise<Buffer> {
  let current = assertDownloadableUrl(url);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    let response: Response;
    try {
      response = await safeFetchHttp(current.toString(), { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "request failed";
      throw new McpToolError(`Could not download the resume: ${reason}`, "invalid_input");
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) {
        throw new McpToolError("Could not download the resume: too many redirects.", "invalid_input");
      }
      current = assertDownloadableUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) {
      throw new McpToolError(`Could not download the resume: the server answered ${response.status}.`, "invalid_input");
    }
    const buffer = await readCapped(response);
    if (buffer.byteLength === 0) throw new McpToolError("The resume file is empty.", "invalid_input");
    return buffer;
  }
  throw new McpToolError("Could not download the resume: too many redirects.", "invalid_input");
}

export type PreparedResume = {
  fileName: string;
  fileType: ResumeContentType;
  buffer: Buffer;
  contentHash: string;
};

/** Fetch/decode and validate a resume without storing anything yet. */
export async function prepareResume(input: ResumeInput): Promise<PreparedResume> {
  const expected = resumeTypeForFileName(input.fileName);
  const buffer = input.base64 ? decodeBase64Resume(input.base64) : await downloadResume(input.url!);
  const detected = sniffResumeType(buffer);
  if (!detected) {
    throw new McpToolError("The file is not a valid PDF, DOC or DOCX document.", "invalid_input");
  }
  if (detected !== expected) {
    throw new McpToolError(
      `The file content is ${detected} but the name ends in .${input.fileName.split(".").pop()}. Rename it to match.`,
      "invalid_input",
    );
  }
  return {
    fileName: input.fileName,
    fileType: detected,
    buffer,
    contentHash: createHash("sha256").update(buffer).digest("hex"),
  };
}

/** Write a prepared resume to workspace storage and re-verify what landed there. */
export async function storePreparedResume(workspaceId: string, resume: PreparedResume) {
  const key = createResumeStorageKey(workspaceId, resume.fileName);
  await storage.put(key, resume.buffer, resume.fileType);
  const verified = await verifyResumeUpload({
    workspaceId,
    key,
    fileName: resume.fileName,
    fileType: resume.fileType,
    fileSize: resume.buffer.byteLength,
  });
  if (!verified) {
    await storage.delete(key).catch(() => undefined);
    throw new McpToolError("The resume could not be stored.", "unavailable");
  }
  return {
    fileUrl: verified.fileUrl,
    fileName: verified.fileName,
    fileType: verified.fileType,
    fileSize: verified.fileSize,
    contentHash: resume.contentHash,
  };
}

/** Plain text of a stored candidate file, with extraction notes. Null when unreadable. */
export async function readStoredResumeText(input: {
  workspaceId: string;
  fileUrl: string;
  fileName: string;
  fileType: string | null;
}): Promise<{ text: string | null; diagnostics: string[] }> {
  const key = resumeKeyFromUrl(input.fileUrl);
  if (!key || !isWorkspaceStorageKey(input.workspaceId, key, "resumes")) {
    return { text: null, diagnostics: ["The file is not stored in this workspace."] };
  }
  try {
    const buffer = await storage.read(key);
    if (buffer.byteLength === 0 || buffer.byteLength > maxResumeFileSize) {
      return { text: null, diagnostics: ["The stored file is empty or too large to read."] };
    }
    const { text, diagnostics } = await extractResumeText({
      buffer,
      fileName: input.fileName,
      mimeType: input.fileType,
    });
    return {
      text: text.trim() ? text : null,
      diagnostics: diagnostics.map((item) => (typeof item === "string" ? item : JSON.stringify(item))),
    };
  } catch {
    return { text: null, diagnostics: ["The stored file could not be read."] };
  }
}
