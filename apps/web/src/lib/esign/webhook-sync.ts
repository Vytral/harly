import "server-only";

import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { activityEvents, db, documents } from "@harly/db";

import { persistSignedDocumentForEnvelope } from "@/lib/esign/signed-artifact";

/**
 * Propagate a submission's terminal state to every ATS document attached to its
 * envelope, and (on completion) persist the signed artifact. Idempotent and
 * monotonic — safe to call from both the webhook and the reconciliation cron.
 */
export async function syncDocumentsForEnvelope(input: {
  workspaceId: string;
  envelopeId: string;
  signatureEnvelopeId: string;
  signatureStatus: "pending" | "signed" | "declined";
  actorId: string | null;
  source?: "webhook" | "reconciliation";
}) {
  const envelopeDocumentCondition = or(
    eq(documents.signatureEnvelopeRefId, input.signatureEnvelopeId),
    and(
      isNull(documents.signatureEnvelopeRefId),
      eq(documents.signatureEnvelopeId, input.envelopeId),
    ),
  );
  const [attached] = await Promise.all([
    db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.workspaceId, input.workspaceId), envelopeDocumentCondition)),
    input.signatureStatus === "signed"
      ? persistSignedDocumentForEnvelope(
          input.workspaceId,
          input.envelopeId,
          input.signatureEnvelopeId,
          input.source,
        )
      : Promise.resolve(null),
  ]);

  if (attached.length === 0) return;

  await db.transaction(async (tx) => {
    const current = await tx
      .select({ id: documents.id, signatureStatus: documents.signatureStatus })
      .from(documents)
      .where(and(eq(documents.workspaceId, input.workspaceId), envelopeDocumentCondition));
    const changed = current.filter((document) => {
      if (input.signatureStatus === "signed") return document.signatureStatus !== "signed";
      if (input.signatureStatus === "declined") {
        return document.signatureStatus !== "signed" && document.signatureStatus !== "declined";
      }
      return document.signatureStatus === "unsigned" || document.signatureStatus === "pending";
    });
    if (changed.length === 0) return;
    await tx
      .update(documents)
      .set({
        signatureStatus: input.signatureStatus,
        signatureProvider: "docuseal",
        signatureEnvelopeRefId: input.signatureEnvelopeId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documents.workspaceId, input.workspaceId),
          inArray(documents.id, changed.map((document) => document.id)),
        ),
      );
    await tx.insert(activityEvents).values(
      changed.map((document) => ({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "document" as const,
        entityId: document.id,
        type: "document.signature_changed",
        metadata: {
          status: input.signatureStatus,
          provider: "docuseal",
          submissionId: input.envelopeId,
        },
      })),
    );
  });
}
