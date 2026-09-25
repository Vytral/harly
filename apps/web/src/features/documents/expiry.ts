import "server-only";

import { and, eq, sql } from "drizzle-orm";

import {
  activityEvents,
  db,
  notifications,
  signatureEnvelopes,
  signatureEvents,
  signatureRecipients,
} from "@harly/db";

const BATCH_SIZE = 200;

type ExpiredDocument = {
  id: string;
  workspaceId: string;
  name: string;
  ownerId: string | null;
  createdById: string | null;
  signatureStatus: string;
  signatureProvider: string | null;
  signatureEnvelopeRefId: string | null;
};

/**
 * Flip documents whose real-world validity (`expiresAt`) has lapsed to
 * `signatureStatus: "expired"`. Native signing links are included because
 * their expiry is owned by Harly; an in-flight DocuSeal envelope's expiry is
 * still owned by its webhook/reconciliation cron. Declined/expired documents
 * are already terminal. Bypasses the manual-edit immutability guard in
 * `saveDocumentSignature` the same way the DocuSeal webhook does: this is a
 * system-driven transition, not a user edit.
 */
export async function expireOverdueDocuments(database: typeof db = db): Promise<{
  expired: number;
  documents: Array<{ workspaceId: string; documentId: string }>;
}> {
  const rows = await database.transaction(async (tx) => {
    const rows = (await tx.execute(sql`
    with due as (
      select "id", "workspace_id", "name", "owner_id", "created_by_id",
        "signature_status", "signature_provider", "signature_envelope_ref_id"
      from "documents"
      where "status" = 'active'
        and "expires_at" is not null
        and "expires_at" <= now()
        and (
          "signature_status" in ('unsigned', 'signed')
          or ("signature_status" = 'pending' and "signature_provider" = 'native')
        )
      order by "expires_at" asc
      limit ${BATCH_SIZE}
    ), updated as (
      update "documents" as d
      set "signature_status" = 'expired', "updated_at" = now()
      from due
      where d."id" = due."id"
      returning d."id" as "id"
    )
    select due."id" as "id", due."workspace_id" as "workspaceId", due."name" as "name",
      due."owner_id" as "ownerId", due."created_by_id" as "createdById",
      due."signature_status" as "signatureStatus", due."signature_provider" as "signatureProvider",
      due."signature_envelope_ref_id" as "signatureEnvelopeRefId"
    from due
    inner join updated on updated."id" = due."id"
    `)) as unknown as ExpiredDocument[];

    if (rows.length === 0) return rows;

    for (const doc of rows) {
      await tx.insert(activityEvents).values({
        workspaceId: doc.workspaceId,
        actorId: null,
        entityType: "document",
        entityId: doc.id,
        type: "document.expired",
        metadata: { name: doc.name },
      });

      if (
        doc.signatureStatus === "pending" &&
        doc.signatureProvider === "native" &&
        doc.signatureEnvelopeRefId
      ) {
        const now = new Date();
        const [envelope] = await tx
          .update(signatureEnvelopes)
          .set({
            status: "voided",
            voidedAt: now,
            lastEventAt: now,
            lastEventKey: `native:${doc.signatureEnvelopeRefId}:expired`,
            updatedAt: now,
          })
          .where(and(
            eq(signatureEnvelopes.id, doc.signatureEnvelopeRefId),
            eq(signatureEnvelopes.workspaceId, doc.workspaceId),
          ))
          .returning({ id: signatureEnvelopes.id });
        if (envelope) {
          await tx
            .update(signatureRecipients)
            .set({ status: "expired", updatedAt: now })
            .where(and(
              eq(signatureRecipients.workspaceId, doc.workspaceId),
              eq(signatureRecipients.envelopeId, doc.signatureEnvelopeRefId),
              eq(signatureRecipients.status, "sent"),
            ));
          await tx
            .insert(signatureEvents)
            .values({
              workspaceId: doc.workspaceId,
              envelopeId: doc.signatureEnvelopeRefId,
              eventKey: `native:${doc.signatureEnvelopeRefId}:expired`,
              eventType: "envelope_expired",
              generatedAt: now,
              payload: { source: "native_expiry_cron", documentId: doc.id },
              processedAt: now,
            })
            .onConflictDoNothing();
        }
      }

      const recipientId = doc.ownerId ?? doc.createdById;
      if (recipientId) {
        await tx
          .insert(notifications)
          .values({
            workspaceId: doc.workspaceId,
            userId: recipientId,
            actorId: null,
            type: "document.expired",
            title: "Document expired",
            body: `"${doc.name}" passed its expiration date and needs review.`,
            href: `/dashboard/documents/${doc.id}`,
            metadata: { documentId: doc.id },
            dedupeKey: `doc-expired-${doc.id}`,
          })
          .onConflictDoNothing({
            target: [notifications.workspaceId, notifications.userId, notifications.dedupeKey],
          });
      }
    }
    return rows;
  });

  if (rows.length === 0) return { expired: 0, documents: [] };

  return {
    expired: rows.length,
    documents: rows.map((row) => ({ workspaceId: row.workspaceId, documentId: row.id })),
  };
}
