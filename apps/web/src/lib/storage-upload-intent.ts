import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type StorageUploadIntent = {
  workspaceId: string;
  key: string;
  contentType: string;
  contentLength: number;
  expiresAt: number;
};

function signingKey(): string {
  const key = process.env.STORAGE_UPLOAD_SECRET ?? process.env.AI_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "STORAGE_UPLOAD_SECRET (or AI_ENCRYPTION_KEY) is required for storage uploads.",
    );
  }
  return key;
}

function sign(payload: string) {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/** Create a short-lived, integrity-protected intent for a single upload. */
export function createStorageUploadIntent(input: StorageUploadIntent): string {
  if (
    !input.key.startsWith(`workspaces/${input.workspaceId}/`) ||
    !Number.isSafeInteger(input.contentLength) ||
    input.contentLength <= 0
  ) {
    throw new Error("Invalid storage upload intent.");
  }
  const payload = Buffer.from(JSON.stringify(input)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Returns a verified, unexpired upload intent or null for every invalid form. */
export function verifyStorageUploadIntent(
  token: string | null | undefined,
): StorageUploadIntent | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const intent = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<StorageUploadIntent>;
    if (
      typeof intent.workspaceId !== "string" ||
      typeof intent.key !== "string" ||
      typeof intent.contentType !== "string" ||
      typeof intent.contentLength !== "number" ||
      !Number.isSafeInteger(intent.contentLength) ||
      intent.contentLength <= 0 ||
      typeof intent.expiresAt !== "number" ||
      intent.expiresAt <= Date.now() ||
      !intent.key.startsWith(`workspaces/${intent.workspaceId}/`)
    ) {
      return null;
    }
    return intent as StorageUploadIntent;
  } catch {
    return null;
  }
}

/** Add an upload intent without changing the storage adapter contract. */
export function appendStorageUploadIntent(uploadUrl: string, intent: string): string {
  const url = new URL(uploadUrl, "http://harly.local");
  url.searchParams.set("intent", intent);
  return uploadUrl.startsWith("/")
    ? `${url.pathname}${url.search}`
    : url.toString();
}
