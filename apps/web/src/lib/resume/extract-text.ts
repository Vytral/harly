import "server-only";

/**
 * Server-side plain-text extraction from an uploaded resume.
 *
 * Replaces the old client-side `file.text()` path (which returned binary
 * garbage for PDF/DOCX). Runs only on the server, where the heavy parsers live.
 * Best-effort: never throws for a recognized format , returns "" if a file
 * yields nothing usable, so callers can fall back gracefully.
 */

export type ResumeFileKind = "pdf" | "docx" | "doc" | "rtf" | "txt" | "unknown";

type ExtractTextInput = {
  buffer: Buffer;
  fileName?: string;
  mimeType?: string | null;
};

const MIME_KIND: Record<string, ResumeFileKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/msword": "doc",
  "application/rtf": "rtf",
  "text/rtf": "rtf",
  "text/plain": "txt",
};

const EXT_KIND: Record<string, ResumeFileKind> = {
  pdf: "pdf",
  docx: "docx",
  doc: "doc",
  rtf: "rtf",
  txt: "txt",
  md: "txt",
};

export function detectResumeFileKind(input: {
  fileName?: string;
  mimeType?: string | null;
}): ResumeFileKind {
  const mime = input.mimeType?.split(";")[0]?.trim().toLowerCase();
  if (mime && MIME_KIND[mime]) {
    return MIME_KIND[mime];
  }

  const ext = input.fileName?.split(".").pop()?.toLowerCase();
  if (ext && EXT_KIND[ext]) {
    return EXT_KIND[ext];
  }

  return "unknown";
}

/** Collapse runaway whitespace while preserving paragraph breaks. */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Drop control characters that survive a bad decode (keep \n and \t). */
function stripControlChars(text: string): string {
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ");
}

/** Minimal RTF -> text: enough to recover contact info and prose for autofill. */
export function rtfToPlainText(rtf: string): string {
  let out = rtf;
  out = out.replace(/\\'[0-9a-fA-F]{2}/g, " "); // hex-escaped bytes
  out = out.replace(/\\u-?\d+\??/g, " "); // unicode escapes
  out = out.replace(/\\par[d]?\b/g, "\n"); // paragraph breaks
  out = out.replace(/\\line\b/g, "\n");
  out = out.replace(/\\tab\b/g, "\t");
  out = out.replace(/\{\\\*[^{}]*\}/g, " "); // ignorable destinations
  out = out.replace(/\\[a-zA-Z]+-?\d* ?/g, " "); // control words
  out = out.replace(/\\[^a-zA-Z]/g, " "); // escaped literals
  out = out.replace(/[{}]/g, " "); // group braces
  return normalizeWhitespace(stripControlChars(out));
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/**
 * Extract plain text from a resume buffer. Best-effort and format-aware.
 * Returns normalized text, or "" when nothing usable could be read.
 */
export async function extractResumeText(input: ExtractTextInput): Promise<{
  text: string;
  kind: ResumeFileKind;
}> {
  const kind = detectResumeFileKind(input);

  try {
    switch (kind) {
      case "pdf":
        return {
          text: normalizeWhitespace(await extractPdf(input.buffer)),
          kind,
        };
      case "docx":
      case "doc":
        // mammoth targets .docx; legacy .doc often still yields readable text.
        return {
          text: normalizeWhitespace(await extractDocx(input.buffer)),
          kind,
        };
      case "rtf":
        return { text: rtfToPlainText(input.buffer.toString("utf8")), kind };
      case "txt":
        return {
          text: normalizeWhitespace(input.buffer.toString("utf8")),
          kind,
        };
      default:
        // Unknown: assume UTF-8 text, strip control noise.
        return {
          text: normalizeWhitespace(
            stripControlChars(input.buffer.toString("utf8")),
          ),
          kind,
        };
    }
  } catch {
    return { text: "", kind };
  }
}
