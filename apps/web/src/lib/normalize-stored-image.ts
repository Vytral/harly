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

/**
 * Normalize an already-uploaded workspace image into a fresh key.
 *
 * - `keyPrefix` narrows which keys a caller may name (public callers are
 *   limited to their own upload area, never existing workspace assets).
 * - `deleteSource` removes the original after a successful conversion. Only
 *   trusted workspace sessions should set it: a key alone is not proof the
 *   caller uploaded it, so anyone else could otherwise delete assets in use.
 * - The source is never deleted when conversion fails (it may be a transient
 *   error, or an image someone else still references).
 */
export async function normalizeStoredWorkspaceImage(input: {
  workspaceId: string;
  key: string;
  mode: ImageNormalizationMode;
  keyPrefix?: string;
  deleteSource?: boolean;
}) {
  const { workspaceId, key, mode, keyPrefix, deleteSource = false } = input;
  if (
    !isWorkspaceStorageKey(workspaceId, key, "images") ||
    (keyPrefix !== undefined && !key.startsWith(keyPrefix))
  ) {
    throw new StoredImageNotFoundError();
  }

  let source: Buffer;
  try {
    source = await storage.read(key);
  } catch {
    throw new StoredImageNotFoundError();
  }

  const normalized = await normalizeUploadedImage(source, mode);

  const normalizedKey = createImageStorageKey(
    workspaceId,
    `${randomUUID()}.${normalized.extension}`,
  );
  await storage.put(normalizedKey, normalized.buffer, normalized.contentType);
  if (deleteSource) await storage.delete(key).catch(() => undefined);

  return {
    key: normalizedKey,
    contentType: normalized.contentType,
    fileUrl: `/api/storage/image?key=${encodeURIComponent(normalizedKey)}`,
  };
}
