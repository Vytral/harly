import "server-only";

import { PDFDocument } from "pdf-lib";

export const NATIVE_ENVELOPE_MAX_BYTES = 20 * 1024 * 1024;
export const NATIVE_SIGNATURE_MAX_BYTES = 500 * 1024;

export type SignaturePlacement = {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

function assertFraction(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Invalid signature placement: ${name}.`);
  }
}

function validatePlacement(placement: SignaturePlacement) {
  if (!Number.isInteger(placement.page) || placement.page < 1) {
    throw new Error("Invalid signature placement page.");
  }
  for (const [name, value] of Object.entries(placement)) {
    if (name !== "page") assertFraction(value, name);
  }
  if (placement.w <= 0 || placement.h <= 0) {
    throw new Error("Signature placement must have a visible size.");
  }
  if (placement.x + placement.w > 1 || placement.y + placement.h > 1) {
    throw new Error("Signature placement must stay inside the page.");
  }
}

/** Embed a transparent PNG into a PDF. Coordinates are top-left fractions. */
export async function bakeSignatureIntoPdf(input: {
  pdfBytes: Buffer;
  signaturePngBytes: Buffer;
  placement?: SignaturePlacement;
  placements?: SignaturePlacement[];
}): Promise<Buffer> {
  if (input.pdfBytes.byteLength <= 0 || input.pdfBytes.byteLength > NATIVE_ENVELOPE_MAX_BYTES) {
    throw new Error("The source PDF is empty or exceeds the 20 MB limit.");
  }
  if (input.signaturePngBytes.byteLength <= 0 || input.signaturePngBytes.byteLength > NATIVE_SIGNATURE_MAX_BYTES) {
    throw new Error("The signature image is empty or exceeds the 500 KB limit.");
  }
  const placements = input.placements ?? (input.placement ? [input.placement] : []);
  if (placements.length === 0 || placements.length > 20) {
    throw new Error("A document must contain between 1 and 20 signature placements.");
  }
  placements.forEach(validatePlacement);

  const pdf = await PDFDocument.load(input.pdfBytes, { updateMetadata: false });
  const image = await pdf.embedPng(input.signaturePngBytes);
  for (const placement of placements) {
    const page = pdf.getPage(placement.page - 1);
    if (!page) throw new Error("The selected PDF page does not exist.");
    const { width, height } = page.getSize();
    const drawWidth = placement.w * width;
    const drawHeight = placement.h * height;
    page.drawImage(image, {
      x: placement.x * width,
      y: height - placement.y * height - drawHeight,
      width: drawWidth,
      height: drawHeight,
    });
  }

  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
