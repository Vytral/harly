import sharp from "sharp";

export type ImageNormalizationMode = "logo" | "image";

const MAX_INPUT_PIXELS = 25_000_000;
const MAX_LOGO_DIMENSION = 1_200;
const MAX_IMAGE_DIMENSION = 2_400;
const SUPPORTED_INPUT_FORMATS = new Set(["png", "jpeg", "webp", "svg"]);

export class UnsupportedImageError extends Error {
  constructor() {
    super("The uploaded file is not a supported image.");
    this.name = "UnsupportedImageError";
  }
}

/**
 * Convert user supplied images to stable raster formats before they are used
 * by the application. Logo trimming removes only pixels matching the image's
 * top-left background, which keeps normal transparent/solid padding without
 * trying to erase colors from inside the artwork.
 */
export async function normalizeUploadedImage(
  input: Buffer,
  mode: ImageNormalizationMode,
): Promise<{ buffer: Buffer; extension: "png" | "webp"; contentType: string }> {
  let pipeline = sharp(input, {
    animated: false,
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
  }).rotate();

  const metadata = await pipeline.metadata().catch(() => null);
  if (
    !metadata ||
    !metadata.format ||
    !SUPPORTED_INPUT_FORMATS.has(metadata.format)
  ) {
    throw new UnsupportedImageError();
  }

  if (mode === "logo") {
    pipeline = pipeline.trim().resize({
      width: MAX_LOGO_DIMENSION,
      height: MAX_LOGO_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });
    return {
      buffer: await pipeline.png().toBuffer(),
      extension: "png",
      contentType: "image/png",
    };
  }

  return {
    buffer: await pipeline
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 88, effort: 4 })
      .toBuffer(),
    extension: "webp",
    contentType: "image/webp",
  };
}
