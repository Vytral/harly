import "server-only";

import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { activityEvents, db, documents } from "@harly/db";

import { persistSignedDocumentForEnvelope } from "@/lib/esign/signed-artifact";
import { resumeWorkflowDocumentWaits } from "@/features/automations/runtime/worker";
import { persistDomainEvent, publishPersistedDomainEvents } from "@/server/events/emit";
import { documentAutomationContext } from "@/lib/esign/document-automation-context";

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

  const changedDocuments = await db.transaction(async (tx) => {
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
    if (changed.length === 0) return { changed: [], events: [] };
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
    const events = await Promise.all(changed.map(async (document) => {
      const targetContext = await documentAutomationContext(tx, input.workspaceId, document.id);
      const event = await persistDomainEvent(tx, {
        name: "document.signature_changed",
        workspaceId: input.workspaceId,
        actorId: input.actorId ?? undefined,
        aggregateType: "document",
        aggregateId: document.id,
        payload: { document: { id: document.id }, ...targetContext, status: input.signatureStatus, provider: "docuseal", envelopeId: input.envelopeId },
      });
      return { event, targetContext };
    }));
    return { changed, events };
  });

  await publishPersistedDomainEvents(changedDocuments.events.map((item) => item.event));
  const { emitWebhookEvent } = await import("@/server/webhooks/emit");
  await Promise.all(
    changedDocuments.changed.map((document, index) =>
      emitWebhookEvent(input.workspaceId, "document.signature_changed", {
        document: { id: document.id },
        ...changedDocuments.events[index]?.targetContext,
        status: input.signatureStatus,
        provider: "docuseal",
        envelopeId: input.envelopeId,
      }, { actorId: input.actorId ?? undefined, skipDomainEvent: true, eventId: changedDocuments.events[index]?.event.eventId }),
    ),
  );

  if (input.signatureStatus === "signed" || input.signatureStatus === "declined") {
    await Promise.all(
      attached.map((document) =>
        resumeWorkflowDocumentWaits({
          workspaceId: input.workspaceId,
          resourceId: document.id,
        }),
      ),
    );
  }
}
