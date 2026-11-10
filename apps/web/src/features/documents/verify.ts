import "server-only";

import { createHash } from "node:crypto";

import { getTranslations } from "@/i18n/server";

import {
  documentExtensionMatches,
  isWorkspaceStorageKey,
  maxDocumentFileSize,
} from "@/lib/storage-validation";
import { storage } from "@/lib/storage";

/**
 * Verify an uploaded document blob before it is adopted into the Documents hub.
 * Confirms the storage key belongs to the workspace, size/extension match, the
 * bytes are readable, and the client-declared checksum matches the actual bytes.
 * Shared by the recruiter upload action and the candidate-portal submit action.
 */
export async function verifyUploadedDocument(input: {
  workspaceId: string;
  storageKey: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}): Promise<{ error: string } | { buffer: Buffer; checksum: string }> {
  const t = await getTranslations("server.documents.verify");
  if (!isWorkspaceStorageKey(input.workspaceId, input.storageKey, "documents")) {
    return { error: t("workspaceMismatch") };
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > maxDocumentFileSize) {
    return { error: t("sizeLimit") };
  }
  if (!documentExtensionMatches(input.name, input.mimeType)) {
    return { error: t("extensionMismatch") };
  }
  let buffer: Buffer;
  try {
    buffer = await storage.read(input.storageKey);
  } catch {
    return { error: t("unreadable") };
  }
  if (buffer.byteLength !== input.sizeBytes) {
    return { error: t("sizeMismatch") };
  }
  const checksum = createHash("sha256").update(buffer).digest("hex");
  if (checksum !== input.checksum.toLowerCase()) {
    return { error: t("checksumMismatch") };
  }
  return { buffer, checksum };
}
