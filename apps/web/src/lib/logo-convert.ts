import sharp from "sharp";
import { eq } from "drizzle-orm";

import { db, organization as organizationTable } from "@harly/db";
import { safeFetchImage } from "@/lib/ssrf";

export type ImageFormat = "png" | "jpeg" | "webp";
const MAX_LOGO_DOWNLOAD_BYTES = 5 * 1024 * 1024;

async function readLogoBody(response: Response): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_LOGO_DOWNLOAD_BYTES) {
    throw new Error("Logo is too large.");
  }
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_LOGO_DOWNLOAD_BYTES) {
      await reader.cancel();
      throw new Error("Logo is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

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
 * Fetch a logo URL (SSRF-safe), convert it to an email-friendly format, upload
 * it, and persist the resulting URL on the organization row. The organization
 * is resolved server-side from the session — callers must NOT pass a
 * client-supplied workspace id, which would let one org overwrite another's
 * email logo.
 */
export async function convertAndStoreLogo(input: {
  organizationId: string;
  logoUrl: string;
  storage: {
    getPresignedUploadUrl(params: {
      key: string;
      contentType: string;
      contentLength: number;
    }): Promise<{ uploadUrl: string; fileUrl: string }>;
  };
}): Promise<{ success: boolean; logoEmailUrl?: string; format?: string }> {
  const { organizationId, logoUrl, storage } = input;

  const response = await safeFetchImage(logoUrl);
  if (!response.ok) {
    throw new Error("Failed to fetch logo.");
  }

  const contentType =
    response.headers.get("content-type") || "image/png";
  const buffer = await readLogoBody(response);

  if (!needsEmailConversion(contentType)) {
    const format = getRecommendedEmailFormat(contentType);
    const converted = await convertLogoForEmail(buffer, contentType, {
      format,
      width: 400,
      height: 120,
      quality: 90,
    });

    const emailKey = `logos/${organizationId}/email.${converted.extension}`;
    const uploadResult = await storage.getPresignedUploadUrl({
      key: emailKey,
      contentType: converted.mimeType,
      contentLength: converted.buffer.length,
    });

    const putResponse = await fetch(uploadResult.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": converted.mimeType },
      body: new Uint8Array(converted.buffer).buffer,
    });

    if (!putResponse.ok) {
      throw new Error("Failed to upload converted logo.");
    }

    await db
      .update(organizationTable)
      .set({ logoEmail: uploadResult.fileUrl })
      .where(eq(organizationTable.id, organizationId));

    return {
      success: true,
      logoEmailUrl: uploadResult.fileUrl,
      format: converted.extension,
    };
  }

  const converted = await convertLogoForEmail(buffer, contentType, {
    format: "png",
    width: 400,
    height: 120,
  });

  const emailKey = `logos/${organizationId}/email.png`;
  const uploadResult = await storage.getPresignedUploadUrl({
    key: emailKey,
    contentType: "image/png",
    contentLength: converted.buffer.length,
  });

  const putResponse = await fetch(uploadResult.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: new Uint8Array(converted.buffer).buffer,
  });

  if (!putResponse.ok) {
    throw new Error("Failed to upload converted logo.");
  }

  await db
    .update(organizationTable)
    .set({ logoEmail: uploadResult.fileUrl })
    .where(eq(organizationTable.id, organizationId));

  return { success: true, logoEmailUrl: uploadResult.fileUrl, format: "png" };
}

/**
 * Get the recommended email format for a given MIME type.
 */
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
