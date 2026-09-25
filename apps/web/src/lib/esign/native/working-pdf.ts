import "server-only";

import { and, eq } from "drizzle-orm";

import { db, signatureArtifacts } from "@harly/db";

import { storage } from "@/lib/storage";

export const WORKING_DOCUMENT_KIND = "working_document";

type Database = typeof db;

export async function workingDocumentKey(
  database: Database,
  workspaceId: string,
  envelopeId: string,
): Promise<string | null> {
  const [row] = await database
    .select({ storageKey: signatureArtifacts.storageKey })
    .from(signatureArtifacts)
    .where(and(
      eq(signatureArtifacts.workspaceId, workspaceId),
      eq(signatureArtifacts.envelopeId, envelopeId),
      eq(signatureArtifacts.kind, WORKING_DOCUMENT_KIND),
    ))
    .limit(1);
  return row?.storageKey ?? null;
}

export async function readWorkingDocument(
  database: Database,
  workspaceId: string,
  envelopeId: string,
): Promise<{ storageKey: string; bytes: Buffer } | null> {
  const storageKey = await workingDocumentKey(database, workspaceId, envelopeId);
  if (!storageKey) return null;
  return { storageKey, bytes: await storage.read(storageKey) };
}
