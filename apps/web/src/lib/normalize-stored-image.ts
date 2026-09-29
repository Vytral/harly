import { randomUUID } from "node:crypto";

import { storage } from "@/lib/storage";
import { createImageStorageKey, isWorkspaceStorageKey } from "@/lib/storage-validation";
import {
  normalizeUploadedImage,
  type ImageNormalizationMode,
} from "@/lib/image-normalization";

export class StoredImageNotFoundError extends Error {
  constructor() {
    super("Image not found.");
    this.name = "StoredImageNotFoundError";
  }
}

export async function normalizeStoredWorkspaceImage(input: {
  workspaceId: string;
  key: string;
  mode: ImageNormalizationMode;
}) {
  const { workspaceId, key, mode } = input;
  if (!isWorkspaceStorageKey(workspaceId, key, "images")) {
    throw new StoredImageNotFoundError();
  }

  let source: Buffer;
  try {
    source = await storage.read(key);
  } catch {
    throw new StoredImageNotFoundError();
  }

  let normalized: Awaited<ReturnType<typeof normalizeUploadedImage>>;
  try {
    normalized = await normalizeUploadedImage(source, mode);
  } catch (error) {
    await storage.delete(key).catch(() => undefined);
    throw error;
  }

  const normalizedKey = createImageStorageKey(
    workspaceId,
    `${randomUUID()}.${normalized.extension}`,
  );
  await storage.put(normalizedKey, normalized.buffer, normalized.contentType);
  await storage.delete(key).catch(() => undefined);

  return {
    key: normalizedKey,
    contentType: normalized.contentType,
    fileUrl: `/api/storage/image?key=${encodeURIComponent(normalizedKey)}`,
  };
}
