import "server-only";

import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import {
  rebuildVectorMark,
  serverVectorExtractor,
  validateVectorSaveInput,
  vectorMarkSvg,
} from "@/features/documents/signature-vector";
import { fitContainOnPage } from "./fit";

export const NATIVE_ENVELOPE_MAX_BYTES = 20 * 1024 * 1024;
export const NATIVE_SIGNATURE_MAX_BYTES = 500 * 1024;
export const NATIVE_FIELD_TEXT_MAX_LENGTH = 200;
/** Contracts commonly need initials + multiple dates + multiple signature
 *  lines; 20 was too tight for that. Still a fixed constant for v1, not a
 *  per-workspace setting. */
export const NATIVE_FIELD_MAX_COUNT = 40;
const MIN_TEXT_FONT_SIZE = 6;

const UNICODE_FONT_PATH = path.join(__dirname, "fonts", "NotoSans-Variable.ttf");

/** Shared by native signing and workflow-generated PDFs so the standalone
 * server resolves the bundled font from one known module-relative location. */
export async function embedNativeUnicodeFont(pdf: PDFDocument) {
  pdf.registerFontkit(fontkit);
  const fontBytes = await fs.readFile(UNICODE_FONT_PATH);
  return pdf.embedFont(fontBytes, { subset: true });
}

export type FieldPlacement =
  | { type: "signature"; page: number; x: number; y: number; w: number; h: number }
  | { type: "text"; page: number; x: number; y: number; w: number; h: number; value: string };

/** @deprecated kept only for the legacy free-placement fallback path in finalize.ts */
export type SignaturePlacement = { page: number; x: number; y: number; w: number; h: number };

function assertFraction(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Invalid field placement: ${name}.`);
  }
}

function validateGeometry(field: { page: number; x: number; y: number; w: number; h: number }) {
  if (!Number.isInteger(field.page) || field.page < 1) {
    throw new Error("Invalid field placement page.");
  }
  assertFraction(field.x, "x");
  assertFraction(field.y, "y");
  assertFraction(field.w, "w");
  assertFraction(field.h, "h");
  if (field.w <= 0 || field.h <= 0) {
    throw new Error("Field placement must have a visible size.");
  }
  if (field.x + field.w > 1 || field.y + field.h > 1) {
    throw new Error("Field placement must stay inside the page.");
  }
}

/** True for ASCII/Latin-1 control characters other than tab/newline/CR —
 *  checked by char code rather than a regex escape range, which is easy to
 *  mangle in transit. Covers C0 (0x00-0x1F) and C1 (0x7F, 0x80-0x9F). */
function isDisallowedControlChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (ch === "\t" || ch === "\n" || ch === "\r") return false;
  return (code <= 0x1f) || code === 0x7f || (code >= 0x80 && code <= 0x9f);
}

/** Reject control characters (except tab/newline/CR) and cap length. Runs
 *  after NFC normalization so composed/decomposed Unicode forms compare the
 *  same way a human would expect. */
function validateAndNormalizeText(value: string): string {
  const normalized = value.normalize("NFC");
  if (normalized.length === 0 || normalized.length > NATIVE_FIELD_TEXT_MAX_LENGTH) {
    throw new Error(`Field text must be between 1 and ${NATIVE_FIELD_TEXT_MAX_LENGTH} characters.`);
  }
  for (const ch of normalized) {
    if (isDisallowedControlChar(ch)) {
      throw new Error("Field text contains unsupported control characters.");
    }
  }
  return normalized;
}

/**
 * Embed a signature image and/or draw text into a PDF at recruiter-defined
 * field positions. Coordinates are top-left fractions of the DISPLAYED page
 * (matching what PdfSignaturePlacer/PdfFieldFiller show in the browser via
 * pdfjs, which renders a page already oriented per its /Rotate entry).
 *
 * Rotation: only unrotated pages (rotation === 0) are supported for now.
 * pdf-lib's drawImage/drawText operate in the page's raw (unrotated) content
 * space, so a page with a non-zero /Rotate needs its coordinates transformed
 * before drawing — for a legally-significant signature placement, shipping
 * unverified rotation math is worse than a clear rejection. Fix this by
 * spiking against a real rotated test PDF (see the project plan's
 * verification section) before lifting this restriction.
 */
export async function assertNativeSignablePdf(pdfBytes: Buffer): Promise<number> {
  if (pdfBytes.byteLength <= 0 || pdfBytes.byteLength > NATIVE_ENVELOPE_MAX_BYTES) {
    throw new Error("The source PDF is empty or exceeds the 20 MB limit.");
  }
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const pageCount = pdf.getPageCount();
  if (pageCount < 1) throw new Error("The PDF has no pages.");
  for (let index = 0; index < pageCount; index += 1) {
    const angle = pdf.getPage(index).getRotation().angle % 360;
    if (angle !== 0) {
      throw new Error("Signing rotated PDF pages isn't supported yet. Re-export the file without rotation and try again.");
    }
  }
  return pageCount;
}

export async function bakeFieldsIntoPdf(input: {
  pdfBytes: Buffer;
  /** Required only if `fields` contains at least one "signature" field. */
  signaturePngBytes?: Buffer;
  fields: FieldPlacement[];
}): Promise<Buffer> {
  if (input.pdfBytes.byteLength <= 0 || input.pdfBytes.byteLength > NATIVE_ENVELOPE_MAX_BYTES) {
    throw new Error("The source PDF is empty or exceeds the 20 MB limit.");
  }
  if (input.fields.length === 0 || input.fields.length > NATIVE_FIELD_MAX_COUNT) {
    throw new Error(`A document must contain between 1 and ${NATIVE_FIELD_MAX_COUNT} field placements.`);
  }
  input.fields.forEach(validateGeometry);

  const needsSignature = input.fields.some((f) => f.type === "signature");
  if (needsSignature) {
    if (
      !input.signaturePngBytes ||
      input.signaturePngBytes.byteLength <= 0 ||
      input.signaturePngBytes.byteLength > NATIVE_SIGNATURE_MAX_BYTES
    ) {
      throw new Error("The signature image is empty or exceeds the 500 KB limit.");
    }
  }

  const pdf = await PDFDocument.load(input.pdfBytes, { updateMetadata: false });

  for (const field of input.fields) {
    const page = pdf.getPage(field.page - 1);
    if (!page) throw new Error("The selected PDF page does not exist.");
    if (page.getRotation().angle !== 0) {
      throw new Error("Signing rotated PDF pages isn't supported yet.");
    }
  }

  const image = needsSignature ? await pdf.embedPng(input.signaturePngBytes!) : null;
  let markAspect = 1;
  if (needsSignature && input.signaturePngBytes) {
    const meta = await sharp(input.signaturePngBytes).metadata();
    if (!meta.width || !meta.height) throw new Error("The signature image could not be read.");
    markAspect = meta.width / meta.height;
  }
  const hasTextField = input.fields.some((f) => f.type === "text");
  let unicodeFont: Awaited<ReturnType<typeof pdf.embedFont>> | null = null;
  if (hasTextField) {
    unicodeFont = await embedNativeUnicodeFont(pdf);
  }

  for (const field of input.fields) {
    const page = pdf.getPage(field.page - 1);
    const { width, height } = page.getSize();
    const drawWidth = field.w * width;
    const drawHeight = field.h * height;
    const drawX = field.x * width;
    const drawY = height - field.y * height - drawHeight;

    if (field.type === "signature") {
      const fitted = fitContainOnPage(field, width, height, markAspect);
      page.drawImage(image!, {
        x: fitted.x,
        y: height - fitted.y - fitted.h,
        width: fitted.w,
        height: fitted.h,
      });
      continue;
    }
    // Text: single-line, auto-shrink to fit the box width, floor at
    // MIN_TEXT_FONT_SIZE then clip with an ellipsis rather than shrinking
    // further into illegibility.
    const value = validateAndNormalizeText(field.value);
    const font = unicodeFont!;
    let fontSize = Math.max(MIN_TEXT_FONT_SIZE, drawHeight * 0.7);
    let text = value;
    while (fontSize > MIN_TEXT_FONT_SIZE && font.widthOfTextAtSize(text, fontSize) > drawWidth) {
      fontSize -= 0.5;
    }
    if (font.widthOfTextAtSize(text, MIN_TEXT_FONT_SIZE) > drawWidth) {
      fontSize = MIN_TEXT_FONT_SIZE;
      while (text.length > 1 && font.widthOfTextAtSize(`${text}…`, fontSize) > drawWidth) {
        text = text.slice(0, -1);
      }
      text = `${text}…`;
    }
    page.drawText(text, {
      x: drawX,
      y: drawY + (drawHeight - fontSize) / 2,
      size: fontSize,
      font,
    });
  }

  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

/** Pixels per capture-pixel when rasterizing a vector outline (Fase A). */
export const VECTOR_BAKE_SCALE = 3;
/** Hard cap on either raster dimension — keeps output far under the PNG cap. */
export const VECTOR_BAKE_MAX_DIM = 1600;

export type RenderedVectorSignature = {
  pngBytes: Buffer;
  width: number;
  height: number;
  areContours: boolean;
};

/**
 * Fase A vector bake, step 1: verify + decompress a stored compressed payload
 * and rasterize its outline to a Hi-DPI PNG (sharp, same pattern as
 * `native/preview.ts`). Coordinates from the extractor are normalized 0..1,
 * so the path is scaled into pixel space with `<g transform>` and the ink
 * stroke keeps its capture-relative weight (`thickness / captureWidth`).
 * Throws fail-closed on any invalid payload — callers never fall back to a
 * different signature silently.
 */
export async function renderVectorSignaturePng(input: {
  vectorData: string;
  maxDim?: number;
}): Promise<RenderedVectorSignature> {
  const shaped = validateVectorSaveInput({ vectorData: input.vectorData });
  if (!shaped.ok) throw new Error("The vector signature is invalid.");
  const maxDim = input.maxDim ?? VECTOR_BAKE_MAX_DIM;
  const mark = await rebuildVectorMark(shaped.vectorData, await serverVectorExtractor());
  if (!mark) throw new Error("The vector signature is invalid.");

  const longSide = Math.max(8, Math.min(maxDim, 1200));
  const width = mark.aspect >= 1 ? longSide : Math.max(8, Math.round(longSide * mark.aspect));
  const height = mark.aspect >= 1 ? Math.max(8, Math.round(longSide / mark.aspect)) : longSide;
  const pngBytes = await sharp(Buffer.from(vectorMarkSvg(mark, width))).png().toBuffer();
  if (pngBytes.byteLength <= 0 || pngBytes.byteLength > NATIVE_SIGNATURE_MAX_BYTES) {
    throw new Error("The signature image is empty or exceeds the 500 KB limit.");
  }
  const meta = await sharp(pngBytes).metadata();
  return {
    pngBytes,
    width: meta.width ?? width,
    height: meta.height ?? height,
    areContours: mark.areContours,
  };
}

/**
 * Fase A vector bake, step 2: same geometry/text contract as
 * `bakeFieldsIntoPdf`, but the signature image is rendered Hi-DPI from the
 * vector outline instead of stretched from a canvas PNG. One shared render
 * is reused across every signature field (downscaling stays crisp).
 */
export async function bakeVectorIntoPdf(input: {
  pdfBytes: Buffer;
  vectorData: string;
  fields: FieldPlacement[];
}): Promise<Buffer> {
  const rendered = await renderVectorSignaturePng({ vectorData: input.vectorData });
  return bakeFieldsIntoPdf({
    pdfBytes: input.pdfBytes,
    signaturePngBytes: rendered.pngBytes,
    fields: input.fields,
  });
}
