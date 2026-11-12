import "server-only";

import { assessTextLegibility } from "@/lib/evaluation/parsing/document";
import { truncateAtLine, truncationDiagnostic } from "@/lib/resume/truncate";

/**
 * Server-side plain-text extraction from an uploaded resume.
 *
 * Replaces the old client-side `file.text()` path (which returned binary
 * garbage for PDF/DOCX). Runs only on the server, where the heavy parsers live.
 * Best-effort: never throws for a recognized format , returns "" if a file
 * yields nothing usable, so callers can fall back gracefully. Every degraded
 * outcome (type mismatch, timeout, page limit, truncation, illegible text) is
 * reported in `diagnostics` instead of being swallowed.
 */

/** Hard limits that keep a hostile or pathological file from hanging a request. */
export const EXTRACTION_TIMEOUT_MS = 15_000;
export const MAX_PDF_PAGES = 40;
/** Extracted text above this is cut at a line boundary (and reported). */
export const MAX_EXTRACTED_CHARS = 200_000;

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

class ExtractionLimitError extends Error {}

/** Detect the real format from magic bytes. Never trust extension or MIME alone. */
export function sniffResumeFileKind(buffer: Buffer): ResumeFileKind {
  if (buffer.length >= 5 && buffer.subarray(0, 1024).includes("%PDF-")) {
    // Spec allows junk before the header within the first 1024 bytes.
    return "pdf";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  ) {
    // OOXML (docx) is a zip container; other zips fail in mammoth and are reported.
    return "docx";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 && buffer[5] === 0xb1 && buffer[6] === 0x1a && buffer[7] === 0xe1
  ) {
    return "doc";
  }
  if (buffer.subarray(0, 8).toString("latin1").startsWith("{\\rtf")) {
    return "rtf";
  }
  // Text: no NUL bytes in the first 8 KB.
  const sample = buffer.subarray(0, 8192);
  if (sample.length > 0 && !sample.includes(0)) {
    return "txt";
  }
  return "unknown";
}

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ExtractionLimitError(`${label} extraction timed out after ${ms} ms`)),
      ms,
    );
  });
  // Swallow a late rejection of the abandoned work so it can't crash the process.
  work.catch(() => {});
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new ExtractionLimitError(
        `PDF has ${pdf.numPages} pages (limit ${MAX_PDF_PAGES}); not a resume-sized document`,
      );
    }
    // Per page, not `mergePages`: merging collapses every whitespace run, line
    // breaks included, into one space, and the resume parser reads line by line
    // (roles, education and skills all came back empty).
    const { text } = await extractText(pdf, { mergePages: false });
    return Array.isArray(text) ? text.join("\n") : text;
  } finally {
    void pdf.loadingTask.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

export type ExtractResumeTextResult = {
  text: string;
  /** The real kind (from magic bytes when they disagree with the declared type). */
  kind: ResumeFileKind;
  /** Why the text is empty, truncated or suspect. Persist these with the document. */
  diagnostics: string[];
  truncated: boolean;
};

/**
 * Extract plain text from a resume buffer. Best-effort and format-aware.
 * Returns normalized text, or "" when nothing usable could be read (with the
 * reason in `diagnostics`). The kind is decided by magic bytes; the declared
 * MIME/extension only breaks ties.
 */
export async function extractResumeText(input: ExtractTextInput): Promise<ExtractResumeTextResult> {
  const declared = detectResumeFileKind(input);
  const sniffed = sniffResumeFileKind(input.buffer);
  const diagnostics: string[] = [];

  const kind: ResumeFileKind = sniffed;
  if (sniffed === "unknown") {
    diagnostics.push(
      `unrecognized or binary file content (declared ${declared}); refusing to treat it as text`,
    );
    return { text: "", kind: declared, diagnostics, truncated: false };
  }
  if (declared !== "unknown" && declared !== sniffed) {
    // txt/rtf declared vs "txt" sniffed is common (markdown, plain RTF-less text);
    // only report disagreements that change the parser.
    const compatible = sniffed === "txt" && (declared === "txt" || declared === "rtf");
    if (!compatible) {
      diagnostics.push(`declared type ${declared} does not match file content (${sniffed}); using content type`);
    }
  }
  // Declared binary format but plain-text bytes: the file is not what it claims.
  if (sniffed === "txt" && (declared === "pdf" || declared === "docx" || declared === "doc")) {
    diagnostics.push(`file claims to be ${declared} but has no ${declared} signature; read as plain text`);
  }

  let raw: string;
  try {
    switch (kind) {
      case "pdf":
        raw = normalizeWhitespace(await withTimeout(extractPdf(input.buffer), EXTRACTION_TIMEOUT_MS, "pdf"));
        break;
      case "docx":
      case "doc":
        // mammoth targets .docx; legacy .doc (OLE) is rejected by it and reported.
        raw = normalizeWhitespace(await withTimeout(extractDocx(input.buffer), EXTRACTION_TIMEOUT_MS, kind));
        break;
      case "rtf":
        raw = rtfToPlainText(input.buffer.toString("utf8"));
        break;
      default:
        raw = normalizeWhitespace(stripControlChars(input.buffer.toString("utf8")));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push(
      error instanceof ExtractionLimitError ? message : `${kind} extraction failed: ${message}`,
    );
    return { text: "", kind, diagnostics, truncated: false };
  }

  // The same legibility filter as the document pipeline, applied on every path
  // so garbled output never reaches parsing, autofill or the AI.
  const legibility = assessTextLegibility(raw);
  if (!legibility.readable) {
    diagnostics.push(`extracted ${kind} text is not legible: ${legibility.reasons.join("; ")}`);
    return { text: "", kind, diagnostics, truncated: false };
  }

  const cut = truncateAtLine(raw, MAX_EXTRACTED_CHARS);
  if (cut.truncated) diagnostics.push(truncationDiagnostic("extracted text", cut));
  if (!cut.text.trim()) diagnostics.push(`${kind} contained no extractable text`);

  return { text: cut.text, kind, diagnostics, truncated: cut.truncated };
}
