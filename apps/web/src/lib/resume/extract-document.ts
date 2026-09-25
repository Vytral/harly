import "server-only";

import { assessTextReadability, fromPlainText, unavailableOcrProvider, type ResumeDocumentProvider } from "@/lib/evaluation/parsing/document";
import type {
  OcrProvider,
  ParsedResumeDocument,
} from "@/lib/evaluation/parsing/document";
import { detectResumeFileKind, extractResumeText } from "@/lib/resume/extract-text";

export interface ResumeDocumentResolution {
  /** Usable plain text, or null when no readable layer exists (profile-only path). */
  text: string | null;
  fileName?: string;
  document: ParsedResumeDocument;
}

/**
 * Document ingestion orchestrator — Phase 4 (§6.3).
 *
 * ```text
 * Text layer sufficiently readable?
 *   ├─ yes → text_layer document (normal parser path)
 *   └─ no → OCR available?
 *       ├─ yes → OCR provider → readable? → ocr document : profile_only
 *       └─ no  → profile_only document + diagnostics + human review downstream
 * ```
 *
 * Never throws and never fabricates text: unreadable sources resolve to a
 * `profile_only` document with `text: null`, so callers fall back to
 * profile-only evaluation (which already escalates to human review).
 */
export async function resolveResumeDocument(
  input: {
    buffer: Buffer;
    fileName?: string;
    mimeType?: string | null;
    bytesHash?: string;
  },
  deps?: { ocrProvider?: OcrProvider; layoutProvider?: ResumeDocumentProvider },
): Promise<ResumeDocumentResolution> {
  const kind = detectResumeFileKind(input);
  const providerDiagnostics: string[] = [];

  // A layout-aware provider may replace the text-layer path without changing
  // fact parsing, matching, or scoring. Its blocks/page coordinates become
  // provenance consumed by parseDocumentFacts (§6.1/§6.2).
  const layoutProvider = deps?.layoutProvider;
  if (layoutProvider) {
    try {
      const provided = await layoutProvider.extractDocument({
        fileName: input.fileName,
        mimeType: input.mimeType ?? undefined,
        bytesHash: input.bytesHash,
        buffer: new Uint8Array(input.buffer),
      });
      if (assessTextReadability(provided.plainText).readable) {
        return {
          text: provided.plainText,
          fileName: input.fileName,
          document: provided,
        };
      }
      providerDiagnostics.push(
        ...provided.diagnostics,
        "layout provider output was not readable; falling back to text-layer/OCR extraction",
      );
    } catch {
      // Provider failure falls through to the standard extractor/OCR path.
      providerDiagnostics.push("layout provider failed; falling back to text-layer/OCR extraction");
    }
  }

  const { text } = await extractResumeText({
    buffer: input.buffer,
    fileName: input.fileName,
    mimeType: input.mimeType,
  });

  if (assessTextReadability(text).readable) {
    return {
      text,
      fileName: input.fileName,
      document: fromPlainText({ fileName: input.fileName, text }),
    };
  }

  const ocr = deps?.ocrProvider ?? unavailableOcrProvider;
  if (ocr.available) {
    try {
      const ocrDoc = await ocr.extractWithOcr({
        buffer: new Uint8Array(input.buffer),
        fileName: input.fileName,
        mimeType: input.mimeType,
      });
      if (ocrDoc && assessTextReadability(ocrDoc.plainText).readable) {
        return { text: ocrDoc.plainText, fileName: input.fileName, document: ocrDoc };
      }
    } catch {
      // OCR failure is not an evaluation failure — fall through to profile-only.
    }
  }

  const readability = assessTextReadability(text);
  return {
    text: null,
    fileName: input.fileName,
    document: {
      // Do not retain garbled/binary extraction as evaluator input. The
      // diagnostics remain available for audit/review, while an empty source
      // guarantees that no facts can be fabricated downstream.
      plainText: "",
      blocks: [],
      pageCount: 0,
      detectedLanguage: undefined,
      extractionMethod: "profile_only",
      extractionConfidence: 0,
      diagnostics: [
        ...providerDiagnostics,
        `text layer (${kind}) not readable: ${readability.reasons.join("; ") || "empty"}`,
        ocr.available
          ? "ocr fallback produced no readable text"
          : "ocr unavailable — profile-only evaluation with human review",
      ],
    },
  };
}
