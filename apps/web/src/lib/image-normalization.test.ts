import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { normalizeUploadedImage, UnsupportedImageError } from "./image-normalization";

describe("normalizeUploadedImage", () => {
  it("trims logo padding and rasterizes SVG to transparent PNG", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect x="20" y="10" width="50" height="60" fill="#285"/></svg>',
    );

    const result = await normalizeUploadedImage(svg, "logo");
    const metadata = await sharp(result.buffer).metadata();

    expect(result.extension).toBe("png");
    expect(result.contentType).toBe("image/png");
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(50);
    expect(metadata.height).toBe(60);
    expect(metadata.hasAlpha).toBe(true);
  });

  it("keeps the full image canvas and converts non-logo images to WebP", async () => {
    const source = await sharp({
      create: {
        width: 80,
        height: 60,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const result = await normalizeUploadedImage(source, "image");
    const metadata = await sharp(result.buffer).metadata();

    expect(result.extension).toBe("webp");
    expect(result.contentType).toBe("image/webp");
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(80);
    expect(metadata.height).toBe(60);
  });

  it("rejects data that Sharp cannot decode as an image", async () => {
    await expect(
      normalizeUploadedImage(Buffer.from("not an image"), "logo"),
    ).rejects.toBeInstanceOf(UnsupportedImageError);
  });
});
