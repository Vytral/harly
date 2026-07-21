import { readFile, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { StorageAdapter } from "../types";

function safeKey(key: string) {
  return key
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "-"))
    .join("/");
}

function getUploadsRoot() {
  const dir = process.env.UPLOADS_DIR;
  return dir ? path.resolve(dir) : path.resolve(process.cwd(), "uploads");
}

export function getLocalUploadPath(key: string) {
  const uploadsRoot = getUploadsRoot();
  const resolvedPath = path.resolve(uploadsRoot, safeKey(key));

  if (!resolvedPath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error("Invalid storage key.");
  }

  return resolvedPath;
}

export class LocalAdapter implements StorageAdapter {
  async getPresignedUploadUrl(params: {
    key: string;
    contentType: string;
    contentLength: number;
  }) {
    const key = safeKey(params.key);
    const encodedKey = encodeURIComponent(key);

    return {
      uploadUrl: `/api/storage/upload?key=${encodedKey}`,
      fileUrl: `/uploads/${key}`,
    };
  }

  async read(key: string) {
    return readFile(getLocalUploadPath(key));
  }

  async put(key: string, content: Buffer) {
    const uploadPath = getLocalUploadPath(key);
    await mkdir(path.dirname(uploadPath), { recursive: true });
    await writeFile(uploadPath, content);
  }

  async delete(key: string) {
    await rm(getLocalUploadPath(key), { force: true });
  }
}
