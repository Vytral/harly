import "server-only";

import { and, eq } from "drizzle-orm";

import {
  activityEvents,
  db,
  documents,
  notifications,
  signatureEnvelopes,
  signatureEvents,
  signatureRecipients,
} from "@harly/db";

import { processEmailOutbox } from "@/lib/email/outbox-processor";
import { documentAutomationContext } from "@/lib/esign/document-automation-context";
import { createLogger } from "@/lib/logger";
import { persistDomainEvent, publishPersistedDomainEvents } from "@/server/events/emit";
import { insertNativeNotice, loadEnvelopeSender, loadEnvelopeSigners } from "./notices";
import type { NativeSigningTarget } from "./remote";

const log = createLogger("native-decline");

/**
 * A signer declines to sign. Ends the whole request (the document can be
 * edited and sent again), keeps signatures already collected in the audit
 * record, and tells the sender who declined and why.
 */
export async function declineNativeSignature(
  target: NativeSigningTarget,
  input: { reason: string | null; ipAddress?: string | null; userAgent?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date();
  const reason = input.reason?.trim().slice(0, 500) || null;
  const outcome = await db.transaction(async (tx) => {
    const [envelope] = await tx
      .select({ id: signatureEnvelopes.id, status: signatureEnvelopes.status })
      .from(signatureEnvelopes)
      .where(and(eq(signatureEnvelopes.id, target.envelopeId), eq(signatureEnvelopes.workspaceId, target.workspaceId)))
      .for("update")
      .limit(1);
    if (!envelope || envelope.status !== "sent") return null;
    const [recipient] = await tx
      .update(signatureRecipients)
      .set({ status: "declined", declinedAt: now, declinedReason: reason, updatedAt: now })
      .where(and(eq(signatureRecipients.id, target.recipientId), eq(signatureRecipients.status, "sent")))
      .returning({ id: signatureRecipients.id });
    if (!recipient) return null;
    await tx.update(signatureEnvelopes).set({ status: "declined", declinedAt: now, lastEventAt: now, lastEventKey: `native:${envelope.id}:declined`, updatedAt: now }).where(eq(signatureEnvelopes.id, envelope.id));
    await tx.update(documents).set({ signatureStatus: "declined", updatedAt: now }).where(and(eq(documents.id, target.documentId), eq(documents.workspaceId, target.workspaceId)));
    await tx.insert(signatureEvents).values({
      workspaceId: target.workspaceId,
      envelopeId: envelope.id,
      eventKey: `native:${envelope.id}:declined:${target.recipientId}`,
      eventType: "declined",
      generatedAt: now,
      payload: { recipientId: target.recipientId, routingOrder: target.routingOrder, reason, ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null },
      processedAt: now,
    });
    await tx.insert(activityEvents).values({
      workspaceId: target.workspaceId,
      actorId: null,
      entityType: "document",
      entityId: target.documentId,
      type: "document.signature_changed",
      metadata: { status: "declined", provider: "native", signer: target.name, reason },
    });
    const context = await documentAutomationContext(tx, target.workspaceId, target.documentId);
    const event = await persistDomainEvent(tx, {
      name: "document.signature_changed",
      workspaceId: target.workspaceId,
      aggregateType: "document",
      aggregateId: target.documentId,
      payload: { document: { id: target.documentId }, ...context, status: "declined", provider: "native", envelopeId: envelope.id },
    });

    const signers = await loadEnvelopeSigners(tx, target.workspaceId, envelope.id);
    const sender = await loadEnvelopeSender(tx, target.workspaceId, envelope.id);
    const signedBefore = signers.filter((row) => row.status === "signed").map((row) => ({ name: row.name, signedAt: row.signedAt?.toISOString() ?? null }));
    const outboxIds: string[] = [];
    if (sender?.email) {
      const id = await insertNativeNotice(tx, {
        workspaceId: target.workspaceId,
        envelopeId: envelope.id,
        recipientKey: sender.id,
        payload: {
          event: "declined",
          audience: "sender",
          recipientEmail: sender.email,
          recipientName: sender.name,
          documentName: target.documentName,
          actorName: target.name,
          reason,
          signedBefore,
          documentUrl: `/dashboard/documents/${target.documentId}`,
        },
      });
      if (id) outboxIds.push(id);
    }
    const [doc] = await tx.select({ ownerId: documents.ownerId, createdById: documents.createdById }).from(documents).where(eq(documents.id, target.documentId)).limit(1);
    const notifyUserId = doc?.ownerId ?? doc?.createdById ?? sender?.id ?? null;
    if (notifyUserId) {
      await tx.insert(notifications).values({
        workspaceId: target.workspaceId,
        userId: notifyUserId,
        actorId: null,
        type: "document.signature_declined",
        title: "Signature declined",
        body: `${target.name} declined to sign "${target.documentName}".${reason ? ` Reason: ${reason}` : ""}`,
        href: `/dashboard/documents/${target.documentId}`,
        metadata: { documentId: target.documentId },
        dedupeKey: `sig-declined-${envelope.id}`,
      }).onConflictDoNothing({ target: [notifications.workspaceId, notifications.userId, notifications.dedupeKey] });
    }
    return { event, context, outboxIds, envelopeId: envelope.id };
  });
  if (!outcome) return { ok: false, error: "This signing request is no longer open." };

  try {
    if (outcome.outboxIds.length) await processEmailOutbox({ ids: outcome.outboxIds, workspaceId: target.workspaceId });
    await publishPersistedDomainEvents([outcome.event]);
    const { emitWebhookEvent } = await import("@/server/webhooks/emit");
    await emitWebhookEvent(target.workspaceId, "document.signature_changed", {
      document: { id: target.documentId },
      ...outcome.context,
      status: "declined",
      provider: "native",
      envelopeId: outcome.envelopeId,
    }, { skipDomainEvent: true, eventId: outcome.event.eventId });
  } catch (error) {
    log.error({ error, documentId: target.documentId }, "native decline follow-up failed after commit");
  }
  return { ok: true };
}
