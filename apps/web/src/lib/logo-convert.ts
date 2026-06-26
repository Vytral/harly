import sharp from "sharp";

export type ImageFormat = "png" | "jpeg" | "webp";

export type ConvertLogoOptions = {
  /** Target format for email compatibility */
  format?: ImageFormat;
  /** Maximum width in pixels (default: 400) */
  width?: number;
  /** Maximum height in pixels (default: 120) */
  height?: number;
  /** JPEG/WebP quality (1-100, default: 90) */
  quality?: number;
};

/**
 * Convert an image buffer to a format compatible with email clients.
 * SVG is converted to PNG. Other formats are optimized.
 */
export async function convertLogoForEmail(
  inputBuffer: Buffer,
  inputMimeType: string,
  options: ConvertLogoOptions = {},
): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
  const {
    format = "png",
    width = 400,
    height = 120,
    quality = 90,
  } = options;

  // If input is already a raster format and matches target, just optimize
  if (
    inputMimeType === `image/${format}` &&
    !inputMimeType.includes("svg")
  ) {
    const optimized = await sharp(inputBuffer)
      .resize(width, height, { fit: "inside", withoutEnlargement: true })
      .toFormat(format, { quality })
      .toBuffer();
    return {
      buffer: optimized,
      mimeType: `image/${format}`,
      extension: format === "jpeg" ? "jpg" : format,
    };
  }

  // Convert SVG or other formats to target format
  let pipeline = sharp(inputBuffer).resize(width, height, {
    fit: "inside",
    withoutEnlargement: true,
  });

  switch (format) {
    case "jpeg":
      pipeline = pipeline.jpeg({ quality });
      break;
    case "webp":
      pipeline = pipeline.webp({ quality });
      break;
    case "png":
    default:
      pipeline = pipeline.png();
      break;
  }

  const buffer = await pipeline.toBuffer();
  const mimeType = `image/${format}`;
  const extension = format === "jpeg" ? "jpg" : format;

  return { buffer, mimeType, extension };
}

/**
 * Check if a MIME type needs conversion for email compatibility.
 * SVG images must be converted; raster formats are generally fine.
 */
export function needsEmailConversion(mimeType: string): boolean {
  return mimeType === "image/svg+xml";
}

/**
 * Get the recommended email format for a given MIME type.
 */
export function getRecommendedEmailFormat(
  mimeType: string,
): ImageFormat {
  if (mimeType === "image/svg+xml") return "png";
  if (mimeType === "image/jpeg") return "jpeg";
  if (mimeType === "image/webp") return "webp";
  return "png"; // Default to PNG for unknown formats
}
