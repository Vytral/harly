import "server-only";

import { and, eq } from "drizzle-orm";

import {
  activityEvents,
  db,
  documents,
  signatureArtifacts,
  signatureEnvelopes,
  signatureEvents,
  signatureRecipients,
} from "@harly/db";

import { processEmailOutbox } from "@/lib/email/outbox-processor";
import { documentAutomationContext } from "@/lib/esign/document-automation-context";
import { createLogger } from "@/lib/logger";
import { persistDomainEvent, publishPersistedDomainEvents } from "@/server/events/emit";
import { insertNativeNotice, loadEnvelopeSigners } from "./notices";
import { WORKING_DOCUMENT_KIND } from "./working-pdf";

const log = createLogger("native-void");

/** Artifact kind the partially signed working copy is kept under after a void. */
export const VOIDED_PARTIAL_KIND = "voided_partial_document";

export type NativeVoidImpact = {
  /** True when a native request is in flight and can be voided. */
  voidable: boolean;
  signers: Array<{ name: string; email: string; status: string; signedAt: Date | null }>;
  /** Signers who already signed. Their signatures are kept in the audit record. */
  signedCount: number;
  /** Plain-language sentence the void dialog should show next to the reason field. */
  warning: string | null;
};

/**
 * What voiding will do, for the confirmation dialog. Earlier signatures are NOT
 * wiped silently: they stay in the audit record (and the partially signed copy
 * is retained), but they are not applied to a new request, so the dialog has
 * to say so.
 */
export async function getNativeVoidImpact(input: { workspaceId: string; documentId: string }): Promise<NativeVoidImpact> {
  const [doc] = await db
    .select({ envelopeId: documents.signatureEnvelopeRefId, provider: documents.signatureProvider, status: documents.signatureStatus })
    .from(documents)
    .where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, input.workspaceId)))
    .limit(1);
  if (!doc || doc.provider !== "native" || doc.status !== "pending" || !doc.envelopeId) {
    return { voidable: false, signers: [], signedCount: 0, warning: null };
  }
  const rows = await db
    .select({ name: signatureRecipients.name, email: signatureRecipients.email, status: signatureRecipients.status, signedAt: signatureRecipients.signedAt, routingOrder: signatureRecipients.routingOrder })
    .from(signatureRecipients)
    .where(and(eq(signatureRecipients.envelopeId, doc.envelopeId), eq(signatureRecipients.workspaceId, input.workspaceId), eq(signatureRecipients.role, "signer")));
  rows.sort((a, b) => a.routingOrder - b.routingOrder);
  const signed = rows.filter((row) => row.status === "signed");
  const invited = rows.filter((row) => row.status === "sent" || row.status === "signed");
  const warning = signed.length
    ? `${signed.map((row) => row.name).join(", ")} already signed. Their signatures stay in the audit record and the partially signed copy is kept, but they will not carry over: if you send this document again, everyone signs again. ${invited.length} ${invited.length === 1 ? "person" : "people"} will be emailed that the request was cancelled.`
    : `${invited.length} ${invited.length === 1 ? "person" : "people"} will be emailed that the request was cancelled.`;
  return { voidable: true, signers: rows.map((row) => ({ name: row.name, email: row.email, status: row.status, signedAt: row.signedAt })), signedCount: signed.length, warning };
}

export async function voidNativeSignature(input: {
  workspaceId: string;
  documentId: string;
  envelopeId: string;
  actorId: string;
  actorName?: string | null;
  reason: string;
}): Promise<{ ok: true; envelopeId: string } | { ok: false; error: string }> {
  const now = new Date();
  let outcome: Awaited<ReturnType<typeof run>>;
  async function run() {
    return db.transaction(async (tx) => {
      const [envelope] = await tx
        .select({ id: signatureEnvelopes.id, status: signatureEnvelopes.status })
        .from(signatureEnvelopes)
        .where(and(eq(signatureEnvelopes.workspaceId, input.workspaceId), eq(signatureEnvelopes.id, input.envelopeId)))
        .for("update")
        .limit(1);
      if (!envelope || envelope.status !== "sent") throw new Error("This signature request is already complete.");
      const signers = await loadEnvelopeSigners(tx, input.workspaceId, envelope.id);
      // Keep the partially signed copy as evidence instead of deleting it.
      await tx.update(signatureArtifacts).set({ kind: VOIDED_PARTIAL_KIND }).where(and(
        eq(signatureArtifacts.workspaceId, input.workspaceId),
        eq(signatureArtifacts.envelopeId, envelope.id),
        eq(signatureArtifacts.kind, WORKING_DOCUMENT_KIND),
      ));
      // Only people who had not signed are marked voided. Signed rows keep
      // their status and timestamp. The token hash is left in place so the
      // old link can explain what happened instead of showing a dead end.
      for (const signer of signers) {
        if (signer.status === "signed") continue;
        await tx.update(signatureRecipients).set({ status: "voided", updatedAt: now }).where(eq(signatureRecipients.id, signer.id));
      }
      await tx.update(signatureEnvelopes).set({ status: "voided", voidedAt: now, voidReason: input.reason, lastEventAt: now, updatedAt: now }).where(eq(signatureEnvelopes.id, envelope.id));
      await tx.update(documents).set({
        signatureStatus: "unsigned",
        signatureProvider: null,
        signatureEnvelopeId: null,
        signatureEnvelopeRefId: null,
        signatureUrl: null,
        expiresAt: null,
        updatedAt: now,
      }).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, input.workspaceId)));
      await tx.insert(signatureEvents).values({
        workspaceId: input.workspaceId,
        envelopeId: envelope.id,
        eventKey: `native:${envelope.id}:voided`,
        eventType: "voided",
        generatedAt: now,
        payload: { actorId: input.actorId, reason: input.reason, signedBeforeVoid: signers.filter((s) => s.status === "signed").map((s) => s.id) },
        processedAt: now,
      });
      await tx.insert(activityEvents).values({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        entityType: "document",
        entityId: input.documentId,
        type: "document.signature_voided",
        metadata: { provider: "native", envelopeId: envelope.id, reason: input.reason, signedBeforeVoid: signers.filter((s) => s.status === "signed").length },
      });
      const targetContext = await documentAutomationContext(tx, input.workspaceId, input.documentId);
      const event = await persistDomainEvent(tx, {
        name: "document.signature_voided",
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        aggregateType: "document",
        aggregateId: input.documentId,
        payload: { document: { id: input.documentId }, ...targetContext, status: "unsigned", provider: "native", envelopeId: envelope.id, reason: input.reason },
      });
      const [named] = await tx.select({ name: documents.name }).from(documents).where(eq(documents.id, input.documentId)).limit(1);
      const signedBefore = signers.filter((s) => s.status === "signed").map((s) => ({ name: s.name, signedAt: s.signedAt?.toISOString() ?? null }));
      const outboxIds: string[] = [];
      for (const signer of signers) {
        if (signer.status !== "sent" && signer.status !== "signed") continue;
        const id = await insertNativeNotice(tx, {
          workspaceId: input.workspaceId,
          envelopeId: envelope.id,
          recipientKey: signer.id,
          actorId: input.actorId,
          payload: {
            event: "voided",
            audience: "signer",
            recipientEmail: signer.email,
            recipientName: signer.name,
            documentName: named?.name ?? "the document",
            actorName: input.actorName ?? undefined,
            reason: input.reason,
            signedBefore,
          },
        });
        if (id) outboxIds.push(id);
      }
      return { event, targetContext, outboxIds, envelopeId: envelope.id };
    });
  }
  try {
    outcome = await run();
  } catch (error) {
    log.error({ error, documentId: input.documentId }, "native void failed");
    return { ok: false, error: error instanceof Error ? error.message : "Could not void the signature request." };
  }
  try {
    if (outcome.outboxIds.length) await processEmailOutbox({ ids: outcome.outboxIds, workspaceId: input.workspaceId });
    await publishPersistedDomainEvents([outcome.event]);
    const { emitWebhookEvent } = await import("@/server/webhooks/emit");
    await emitWebhookEvent(input.workspaceId, "document.signature_voided", {
      document: { id: input.documentId },
      ...outcome.targetContext,
      status: "unsigned",
      provider: "native",
      envelopeId: outcome.envelopeId,
      reason: input.reason,
    }, { actorId: input.actorId, skipDomainEvent: true, eventId: outcome.event.eventId });
  } catch (error) {
    log.error({ error, documentId: input.documentId }, "native void follow-up failed after commit");
  }
  return { ok: true, envelopeId: outcome.envelopeId };
}
