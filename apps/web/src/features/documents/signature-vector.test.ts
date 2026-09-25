import { describe, expect, it } from "vitest";

// Real extractor through the legacy build: same algorithm as the browser
// build, but without top-level DOM dependencies so it loads in node.
// (The default `pdfjs-dist` entry needs DOMMatrix and crashes in node;
// the client code keeps using the default entry via dynamic import.)
import { SignatureExtractor as RealExtractor } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  getVectorFromDraw,
  getVectorFromType,
  rebuildVectorMark,
  rebuildVectorPreview,
  serverVectorExtractor,
  verifyVectorPayload,
  type VectorExtractor,
} from "./signature-vector";

const DIMS = { width: 700, height: 180 };

// Two synthetic pen strokes in 700x180 canvas pixels.
const DRAW_CURVES = [
  { points: [10, 20, 60, 40, 120, 30, 180, 60] },
  { points: [15, 100, 80, 120, 140, 110] },
];

describe("vector draw (real extractor)", () => {
  it("produces a non-empty SVG path and roundtrips compress/decompress", async () => {
    const vector = await getVectorFromDraw(
      DRAW_CURVES,
      DIMS,
      RealExtractor as unknown as VectorExtractor,
    );
    expect(vector).not.toBeNull();
    expect(vector!.outlinePath.length).toBeGreaterThan(0);
    expect(vector!.outlinePath.startsWith("M")).toBe(true);
    expect(vector!.areContours).toBe(false);
    expect(vector!.curveCount).toBe(2);
    expect(vector!.compressed).toBeTruthy();

    const back = (await (
      RealExtractor as unknown as VectorExtractor
    ).decompressSignature(vector!.compressed!)) as {
      outlines: ArrayLike<number>[];
      width: number;
      height: number;
    };
    expect(back.outlines.length).toBe(2);
    expect(back.width).toBe(DIMS.width);
    expect(back.height).toBe(DIMS.height);
  });
});

describe('vector type "Ana" (real contour pipeline)', () => {
  it("forwards text+font and roundtrips a filled-contour outline", async () => {
    // `extractContoursFromText` needs OffscreenCanvas (browser-only), so the
    // raster step is stubbed — but it delegates to the REAL
    // `processDrawnLines` contour pipeline with glyph-like closed loops,
    // exactly what rasterization would hand over for "Ana".
    const seen: { text?: string; font?: unknown } = {};
    const stub = {
      extractContoursFromText: (text: string, fontInfo: unknown) => {
        seen.text = text;
        seen.font = fontInfo;
        return (
          RealExtractor as unknown as VectorExtractor
        ).processDrawnLines({
          lines: {
            // Closed loops like glyph outer contours.
            curves: [
              { points: [5, 5, 60, 5, 60, 40, 5, 40, 5, 5] },
              { points: [70, 10, 110, 10, 110, 35, 70, 35, 70, 10] },
            ],
            width: 200,
            height: 100,
          },
          pageWidth: 200,
          pageHeight: 100,
          rotation: 0,
          innerMargin: 0,
          mustSmooth: true,
          areContours: true,
        });
      },
      compressSignature: (
        RealExtractor as unknown as VectorExtractor
      ).compressSignature.bind(RealExtractor),
      decompressSignature: (
        RealExtractor as unknown as VectorExtractor
      ).decompressSignature.bind(RealExtractor),
    } as unknown as VectorExtractor;

    const vector = await getVectorFromType(
      "Ana",
      { fontFamily: "cursive", fontStyle: "italic", fontWeight: "400" },
      { width: 200, height: 100 },
      stub,
    );
    expect(seen.text).toBe("Ana");
    expect(vector).not.toBeNull();
    expect(vector!.outlinePath.length).toBeGreaterThan(0);
    expect(vector!.areContours).toBe(true);
    expect(vector!.compressed).toBeTruthy();

    const back = (await stub.decompressSignature(vector!.compressed!)) as {
      outlines: ArrayLike<number>[];
    };
    expect(back.outlines.length).toBe(2);
  });
});

describe("vector input validation", () => {  it("rejects empty strokes and empty/oversized text", async () => {
    await expect(
      getVectorFromDraw(
        [],
        DIMS,
        RealExtractor as unknown as VectorExtractor,
      ),
    ).rejects.toThrow();
    await expect(
      getVectorFromType(
        "   ",
        { fontFamily: "cursive", fontStyle: "italic", fontWeight: "400" },
        DIMS,
        RealExtractor as unknown as VectorExtractor,
      ),
    ).rejects.toThrow();
    await expect(
      getVectorFromType(
        "a".repeat(201),
        { fontFamily: "cursive", fontStyle: "italic", fontWeight: "400" },
        DIMS,
        RealExtractor as unknown as VectorExtractor,
      ),
    ).rejects.toThrow();
  });
});

describe("rebuildVectorPreview (saved dual-read)", () => {
  it("rebuilds a non-empty path from a stored payload and rejects garbage", async () => {
    const vector = await getVectorFromDraw(
      DRAW_CURVES,
      DIMS,
      RealExtractor as unknown as VectorExtractor,
    );
    const rebuilt = await rebuildVectorPreview(
      vector!.compressed!,
      RealExtractor as unknown as VectorExtractor,
    );
    expect(rebuilt).not.toBeNull();
    expect(rebuilt!.outlinePath.length).toBeGreaterThan(0);
    expect(rebuilt!.viewBox.split(/\s+/)).toHaveLength(4);
    expect(rebuilt!.aspect).toBeGreaterThan(0);
    expect(rebuilt!.areContours).toBe(false);
    const again = await rebuildVectorMark(vector!.compressed!, RealExtractor as unknown as VectorExtractor);
    expect(again?.outlinePath).toBe(rebuilt!.outlinePath);

    await expect(
      rebuildVectorPreview("!!!not-base64!!!", RealExtractor as unknown as VectorExtractor),
    ).resolves.toBeNull();
    await expect(
      rebuildVectorPreview("", RealExtractor as unknown as VectorExtractor),
    ).resolves.toBeNull();
  });
});

describe("verifyVectorPayload (server path)", () => {
  it("verifies a real payload and rejects garbage fail-closed", async () => {
    const vector = await getVectorFromDraw(
      DRAW_CURVES,
      DIMS,
      RealExtractor as unknown as VectorExtractor,
    );
    const meta = await verifyVectorPayload(vector!.compressed!, serverVectorExtractor);
    expect(meta).not.toBeNull();
    expect(meta!.curves).toBe(2);
    expect(meta!.width).toBe(DIMS.width);

    await expect(verifyVectorPayload("!!!nope!!!", serverVectorExtractor)).resolves.toBeNull();
    await expect(verifyVectorPayload("", serverVectorExtractor)).resolves.toBeNull();
  });
});


