import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";

import { bakeFieldsIntoPdf, NATIVE_FIELD_MAX_COUNT } from "./bake";

async function sourcePdf(pageCount = 1) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) pdf.addPage([600, 800]);
  return Buffer.from(await pdf.save());
}

async function rotatedSourcePdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  page.setRotation(degrees(90));
  return Buffer.from(await pdf.save());
}

async function signaturePng() {
  // 1x1 transparent PNG; pdf-lib only needs a valid PNG stream for this test.
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
}

describe("bakeFieldsIntoPdf", () => {
  it("stamps a signature field and preserves a readable PDF", async () => {
    const result = await bakeFieldsIntoPdf({
      pdfBytes: await sourcePdf(),
      signaturePngBytes: await signaturePng(),
      fields: [{ type: "signature", page: 1, x: 0.1, y: 0.8, w: 0.3, h: 0.08 }],
    });
    const parsed = await PDFDocument.load(result);
    expect(parsed.getPageCount()).toBe(1);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("draws a text field without requiring signature bytes", async () => {
    const result = await bakeFieldsIntoPdf({
      pdfBytes: await sourcePdf(),
      fields: [{ type: "text", page: 1, x: 0.1, y: 0.5, w: 0.3, h: 0.06, value: "2026-08-02" }],
    });
    const parsed = await PDFDocument.load(result);
    expect(parsed.getPageCount()).toBe(1);
  });

  it("draws non-Latin text via the embedded Unicode font", async () => {
    const result = await bakeFieldsIntoPdf({
      pdfBytes: await sourcePdf(),
      fields: [{ type: "text", page: 1, x: 0.1, y: 0.5, w: 0.4, h: 0.06, value: "Müñoz Владимир" }],
    });
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("shrinks and ellipsis-clips text that doesn't fit the box", async () => {
    const result = await bakeFieldsIntoPdf({
      pdfBytes: await sourcePdf(),
      fields: [
        {
          type: "text",
          page: 1,
          x: 0.1,
          y: 0.5,
          // Deliberately tiny box relative to a long value.
          w: 0.05,
          h: 0.02,
          value: "This is a much longer value than the box can hold",
        },
      ],
    });
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("rejects a field placement outside the page", async () => {
    await expect(
      bakeFieldsIntoPdf({
        pdfBytes: await sourcePdf(),
        signaturePngBytes: await signaturePng(),
        fields: [{ type: "signature", page: 1, x: 0.9, y: 0.9, w: 0.3, h: 0.3 }],
      }),
    ).rejects.toThrow("inside the page");
  });

  it("rejects oversized text values", async () => {
    await expect(
      bakeFieldsIntoPdf({
        pdfBytes: await sourcePdf(),
        fields: [{ type: "text", page: 1, x: 0.1, y: 0.5, w: 0.3, h: 0.06, value: "a".repeat(201) }],
      }),
    ).rejects.toThrow("between 1 and 200 characters");
  });

  it("rejects text values containing control characters", async () => {
    await expect(
      bakeFieldsIntoPdf({
        pdfBytes: await sourcePdf(),
        fields: [
          {
            type: "text",
            page: 1,
            x: 0.1,
            y: 0.5,
            w: 0.3,
            h: 0.06,
            value: "bad" + String.fromCharCode(7) + "value",
          },
        ],
      }),
    ).rejects.toThrow("control characters");
  });

  it("rejects a signature field with no signature bytes provided", async () => {
    await expect(
      bakeFieldsIntoPdf({
        pdfBytes: await sourcePdf(),
        fields: [{ type: "signature", page: 1, x: 0.1, y: 0.8, w: 0.3, h: 0.08 }],
      }),
    ).rejects.toThrow("signature image");
  });

  it("rejects more than NATIVE_FIELD_MAX_COUNT fields", async () => {
    const fields = Array.from({ length: NATIVE_FIELD_MAX_COUNT + 1 }, () => ({
      type: "text" as const,
      page: 1,
      x: 0.1,
      y: 0.1,
      w: 0.05,
      h: 0.02,
      value: "x",
    }));
    await expect(bakeFieldsIntoPdf({ pdfBytes: await sourcePdf(), fields })).rejects.toThrow(
      `between 1 and ${NATIVE_FIELD_MAX_COUNT}`,
    );
  });

  it("embeds fields across multiple pages", async () => {
    const result = await bakeFieldsIntoPdf({
      pdfBytes: await sourcePdf(2),
      signaturePngBytes: await signaturePng(),
      fields: [
        { type: "signature", page: 1, x: 0.1, y: 0.8, w: 0.3, h: 0.08 },
        { type: "text", page: 2, x: 0.5, y: 0.7, w: 0.25, h: 0.05, value: "Jane Doe" },
      ],
    });
    const parsed = await PDFDocument.load(result);
    expect(parsed.getPageCount()).toBe(2);
  });

  it("rejects rotated pages rather than guessing at unverified geometry", async () => {
    await expect(
      bakeFieldsIntoPdf({
        pdfBytes: await rotatedSourcePdf(),
        signaturePngBytes: await signaturePng(),
        fields: [{ type: "signature", page: 1, x: 0.1, y: 0.8, w: 0.3, h: 0.08 }],
      }),
    ).rejects.toThrow("rotated PDF");
  });
});
