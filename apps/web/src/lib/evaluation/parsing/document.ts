/**
 * Document ingestion seam — Phase 4 preparation (Audit doc §6, §24 Phase 4).
 *
 * The evaluator must not be bound to one text-extraction path. These types
 * define the parsing-provider abstraction; the existing plain-text flow
 * becomes the `text_layer` provider. Future providers (layout-aware PDF,
 * OCR fallback, DOCX) implement `ResumeDocumentProvider` without touching
 * scoring logic.
 *
 * Provenance (`blockId`/`pageNumber`) flows into `TextProvenance` so the
 * audit drawer can highlight exact source blocks (§22.5).
 */

export interface ResumeDocumentInput {
  fileName?: string;
  mimeType?: string;
  bytesHash?: string;
  rawText?: string;
  /** Optional source bytes for layout/OCR providers. */
  buffer?: Uint8Array;
}

export interface ParsedDocumentBlock {
  id: string;
  page?: number;
  text: string;
  order: number;
  bbox?: { x: number; y: number; width: number; height: number };
  confidence?: number;
}

export type DocumentExtractionMethod = "text_layer" | "layout_parser" | "ocr" | "profile_only";

export interface ParsedResumeDocument {
  plainText: string;
  blocks: ParsedDocumentBlock[];
  pageCount?: number;
  detectedLanguage?: string;
  extractionMethod: DocumentExtractionMethod;
  extractionConfidence: number;
  diagnostics: string[];
}

export interface ResumeDocumentProvider {
  readonly method: DocumentExtractionMethod;
  extractDocument(input: ResumeDocumentInput): Promise<ParsedResumeDocument> | ParsedResumeDocument;
}

export interface TextReadability {
  readable: boolean;
  reasons: string[];
}

/**
 * Conservative readability gate for a text-layer extraction (§6.3).
 * Answers only "is this usable as matching input" — never guesses content.
 * Thresholds err toward readable: a short but dense snippet still passes.
 */
export function assessTextReadability(text: string): TextReadability {
  const reasons: string[] = [];
  const trimmed = text.trim();
  if (trimmed.length < 50) {
    reasons.push(`extracted text too short (${trimmed.length} chars)`);
  }
  if (trimmed.length > 0) {
    const alnum = (trimmed.match(/[a-zA-Z0-9À-ÿ]/g) ?? []).length;
    const density = alnum / trimmed.length;
    if (density < 0.4) {
      reasons.push(`low alphanumeric density (${density.toFixed(2)}) — likely binary/garbled extraction`);
    }
    const replacement = (trimmed.match(/�/g) ?? []).length;
    if (replacement / trimmed.length > 0.05) {
      reasons.push(`high replacement-character rate (${replacement} U+FFFD) — failed decode`);
    }
  }
  return { readable: reasons.length === 0, reasons };
}

/**
 * OCR provider seam (§6.3). OCR is a fallback, never mandatory: when no
 * provider is configured the engine degrades to profile-only evaluation with
 * human review instead of fabricating facts.
 */
export interface OcrProvider {
  readonly name: string;
  readonly available: boolean;
  extractWithOcr(input: {
    buffer: Uint8Array;
    fileName?: string;
    mimeType?: string | null;
  }): Promise<ParsedResumeDocument | null>;
}

export const unavailableOcrProvider: OcrProvider = {
  name: "unavailable",
  available: false,
  extractWithOcr: async () => null,
};

/**
 * Text-layer provider: wraps already-extracted plain text (current behavior).
 * One block per non-empty line, reading order = line order. Language
 * detection is intentionally absent — Phase 4 adds it; `undefined` here is
 * honest, never a guess.
 */
export function fromPlainText(input: { fileName?: string; text: string }): ParsedResumeDocument {
  const lines = input.text.split(/\r?\n/);
  const blocks: ParsedDocumentBlock[] = [];
  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;
    blocks.push({ id: `block:${blocks.length}`, page: 1, text, order: blocks.length, confidence: 1 });
  }
  const empty = blocks.length === 0;
  return {
    plainText: input.text,
    blocks,
    pageCount: 1,
    detectedLanguage: undefined,
    extractionMethod: "text_layer",
    extractionConfidence: empty ? 0 : 1,
    diagnostics: empty ? ["empty input text: no blocks extracted"] : [],
  };
}
