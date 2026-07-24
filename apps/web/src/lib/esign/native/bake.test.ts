import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import { bakeSignatureIntoPdf } from "./bake";

async function sourcePdf(pageCount = 1) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) pdf.addPage([600, 800]);
  return Buffer.from(await pdf.save());
}

async function signaturePng() {
  // 1x1 transparent PNG; pdf-lib only needs a valid PNG stream for this test.
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
}

describe("bakeSignatureIntoPdf", () => {
  it("embeds the signature and preserves a readable PDF", async () => {
    const result = await bakeSignatureIntoPdf({
      pdfBytes: await sourcePdf(),
      signaturePngBytes: await signaturePng(),
      placement: { page: 1, x: 0.1, y: 0.8, w: 0.3, h: 0.08 },
    });
    const parsed = await PDFDocument.load(result);
    expect(parsed.getPageCount()).toBe(1);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("rejects placement outside the page", async () => {
    await expect(
      bakeSignatureIntoPdf({
        pdfBytes: await sourcePdf(),
        signaturePngBytes: await signaturePng(),
        placement: { page: 1, x: 0.9, y: 0.9, w: 0.3, h: 0.3 },
      }),
    ).rejects.toThrow("inside the page");
  });

  it("embeds multiple placements across multiple pages", async () => {
    const result = await bakeSignatureIntoPdf({
      pdfBytes: await sourcePdf(2),
      signaturePngBytes: await signaturePng(),
      placements: [
        { page: 1, x: 0.1, y: 0.8, w: 0.3, h: 0.08 },
        { page: 2, x: 0.5, y: 0.7, w: 0.25, h: 0.1 },
      ],
    });
    const parsed = await PDFDocument.load(result);
    expect(parsed.getPageCount()).toBe(2);
    expect(result.byteLength).toBeGreaterThan(0);
  });
});
