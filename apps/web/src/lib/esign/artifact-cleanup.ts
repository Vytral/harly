import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db, signatureArtifacts } from "@harly/db";

import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";

const log = createLogger("esign-artifact-cleanup");

/** A signed PDF must point at the immutable document it represents. */
export function isOrphanedSignedArtifact(input: {
  kind: string;
  documentId: string | null;
}): boolean {
  return input.kind === "signed_document" && input.documentId === null;
}
/**
 * Remove rows left by an interrupted/legacy signed-artifact write. Completion
 * certificates intentionally have no document row, so only signed PDF rows
 * without a document are eligible. Storage is deleted first; if that fails the
 * row remains for a later retry and the binary is not silently forgotten.
 */
export async function cleanupOrphanedSignedArtifacts(input: {
  workspaceId: string;
  limit?: number;
}): Promise<{ removed: number; retained: number }> {
  const rows = await db
    .select({
      id: signatureArtifacts.id,
      storageKey: signatureArtifacts.storageKey,
      kind: signatureArtifacts.kind,
      documentId: signatureArtifacts.documentId,
    })
    .from(signatureArtifacts)
    .where(
      and(
        eq(signatureArtifacts.workspaceId, input.workspaceId),
        eq(signatureArtifacts.kind, "signed_document"),
        isNull(signatureArtifacts.documentId),
      ),
    )
    .limit(input.limit ?? 100);

  let removed = 0;
  let retained = 0;
  for (const row of rows) {
    if (!isOrphanedSignedArtifact(row)) continue;
    try {
      await storage.delete(row.storageKey);
      await db
        .delete(signatureArtifacts)
        .where(
          and(
            eq(signatureArtifacts.workspaceId, input.workspaceId),
            eq(signatureArtifacts.id, row.id),
            isNull(signatureArtifacts.documentId),
          ),
        );
      removed += 1;
    } catch (error) {
      retained += 1;
      log.warn({ error, artifactId: row.id }, "orphaned signed artifact retained");
    }
  }
  return { removed, retained };
}
