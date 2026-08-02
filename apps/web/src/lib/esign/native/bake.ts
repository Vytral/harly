import "server-only";

import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs/promises";
import path from "node:path";

export const NATIVE_ENVELOPE_MAX_BYTES = 20 * 1024 * 1024;
export const NATIVE_SIGNATURE_MAX_BYTES = 500 * 1024;
export const NATIVE_FIELD_TEXT_MAX_LENGTH = 200;
/** Contracts commonly need initials + multiple dates + multiple signature
 *  lines; 20 was too tight for that. Still a fixed constant for v1, not a
 *  per-workspace setting. */
export const NATIVE_FIELD_MAX_COUNT = 40;
const MIN_TEXT_FONT_SIZE = 6;

const UNICODE_FONT_PATH = path.join(__dirname, "fonts", "NotoSans-Variable.ttf");

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
  const hasTextField = input.fields.some((f) => f.type === "text");
  let unicodeFont: Awaited<ReturnType<typeof pdf.embedFont>> | null = null;
  if (hasTextField) {
    pdf.registerFontkit(fontkit);
    const fontBytes = await fs.readFile(UNICODE_FONT_PATH);
    unicodeFont = await pdf.embedFont(fontBytes, { subset: true });
  }

  for (const field of input.fields) {
    const page = pdf.getPage(field.page - 1);
    const { width, height } = page.getSize();
    const drawWidth = field.w * width;
    const drawHeight = field.h * height;
    const drawX = field.x * width;
    const drawY = height - field.y * height - drawHeight;

    if (field.type === "signature") {
      page.drawImage(image!, { x: drawX, y: drawY, width: drawWidth, height: drawHeight });
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
