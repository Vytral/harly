import "server-only";

import { createHash } from "node:crypto";

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
  if (!isWorkspaceStorageKey(input.workspaceId, input.storageKey, "documents")) {
    return { error: "The upload does not belong to this workspace." };
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > maxDocumentFileSize) {
    return { error: "Document is empty or exceeds the 25 MB limit." };
  }
  if (!documentExtensionMatches(input.name, input.mimeType)) {
    return { error: "The file extension does not match its content type." };
  }
  let buffer: Buffer;
  try {
    buffer = await storage.read(input.storageKey);
  } catch {
    return { error: "The uploaded file could not be read." };
  }
  if (buffer.byteLength !== input.sizeBytes) {
    return { error: "Uploaded file size could not be verified." };
  }
  const checksum = createHash("sha256").update(buffer).digest("hex");
  if (checksum !== input.checksum.toLowerCase()) {
    return { error: "Uploaded file checksum could not be verified." };
  }
  return { buffer, checksum };
}
