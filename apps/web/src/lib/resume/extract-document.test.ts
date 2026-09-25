import { describe, expect, it } from "vitest";

import {
  resolveResumeDocument,
  type ResumeDocumentResolution,
} from "./extract-document";

function asBuffer(text: string): Buffer {
  return Buffer.from(text, "utf8");
}

describe("Phase 4 — extraction orchestrator (§6.3)", () => {
  it("resolves readable text through the text-layer path", async () => {
    const resolution: ResumeDocumentResolution = await resolveResumeDocument({
      buffer: asBuffer("Ana Torres\nSenior Backend Engineer\n\nEXPERIENCE\nBackend Developer — ShopLine (2019-2022)\n• Built REST APIs in Python with Docker and AWS across several production services."),
      fileName: "cv.txt",
    });
    expect(resolution.text).toContain("Ana Torres");
    expect(resolution.document.extractionMethod).toBe("text_layer");
    expect(resolution.document.blocks.length).toBeGreaterThan(0);
    expect(resolution.document.diagnostics).toEqual([]);
  });

  it("degrades unreadable extraction to profile-only with diagnostics (no fabrication)", async () => {
    const resolution = await resolveResumeDocument({
      // Garbage bytes posing as a PDF: unpdf yields nothing usable.
      buffer: asBuffer("%PDF-1.4 %âãÏÓ\n0000 <</Length/Filter/FlateDecode>>\n"),
      fileName: "scan.pdf",
    });
    expect(resolution.text).toBeNull();
    expect(resolution.document.extractionMethod).toBe("profile_only");
    expect(resolution.document.blocks).toEqual([]);
    expect(resolution.document.diagnostics.length).toBeGreaterThan(0);
  });

  it("uses an available OCR provider when the text layer fails", async () => {
    const resolution = await resolveResumeDocument(
      { buffer: asBuffer(""), fileName: "scan.pdf" },
      {
        ocrProvider: {
          name: "test-ocr",
          available: true,
          extractWithOcr: async () => ({
            plainText: "Ana Torres\n\nEXPERIENCE\nBackend Developer — ShopLine (2019-2022)\n• Built REST APIs in Python.",
            blocks: [{ id: "ocr:0", page: 1, text: "Backend Developer — ShopLine (2019-2022)", order: 0 }],
            pageCount: 1,
            extractionMethod: "ocr",
            extractionConfidence: 0.7,
            diagnostics: [],
          }),
        },
      },
    );
    expect(resolution.text).toContain("Ana Torres");
    expect(resolution.document.extractionMethod).toBe("ocr");
  });

  it("allows a layout-aware provider to replace text extraction", async () => {
    const resolution = await resolveResumeDocument(
      { buffer: asBuffer("layout bytes"), fileName: "designed.pdf" },
      {
        layoutProvider: {
          method: "layout_parser",
          extractDocument: (input) => ({
            plainText: "Ana Torres\n\nEXPERIENCE\nBackend Developer — Acme (2022-Present)\n• Built APIs in Python.",
            blocks: [
              { id: "page:1:block:7", page: 1, text: "Backend Developer — Acme (2022-Present)", order: 0, bbox: { x: 10, y: 20, width: 200, height: 12 } },
              { id: "page:1:block:8", page: 1, text: "• Built APIs in Python.", order: 1 },
            ],
            pageCount: 1,
            detectedLanguage: "en",
            extractionMethod: input.buffer ? "layout_parser" : "text_layer",
            extractionConfidence: 0.96,
            diagnostics: [],
          }),
        },
      },
    );
    expect(resolution.document.extractionMethod).toBe("layout_parser");
    expect(resolution.document.blocks[0]?.bbox?.x).toBe(10);
    expect(resolution.text).toContain("Python");
  });

  it("falls back to profile-only when OCR also fails", async () => {
    const resolution = await resolveResumeDocument(
      { buffer: asBuffer(""), fileName: "scan.pdf" },
      {
        ocrProvider: {
          name: "broken-ocr",
          available: true,
          extractWithOcr: async () => null,
        },
      },
    );
    expect(resolution.text).toBeNull();
    expect(resolution.document.extractionMethod).toBe("profile_only");
  });

  it("retains layout-provider diagnostics when its output is unreadable", async () => {
    const resolution = await resolveResumeDocument(
      { buffer: asBuffer("raw bytes"), fileName: "designed.pdf" },
      {
        layoutProvider: {
          method: "layout_parser",
          extractDocument: async () => ({
            plainText: "",
            blocks: [],
            extractionMethod: "layout_parser",
            extractionConfidence: 0.1,
            diagnostics: ["columns could not be ordered"],
          }),
        },
      },
    );

    expect(resolution.document.extractionMethod).toBe("profile_only");
    expect(resolution.document.diagnostics).toContain("columns could not be ordered");
    expect(resolution.document.diagnostics).toContain(
      "layout provider output was not readable; falling back to text-layer/OCR extraction",
    );
  });
});
