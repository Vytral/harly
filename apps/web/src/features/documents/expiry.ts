import "server-only";

import { sql } from "drizzle-orm";

import { activityEvents, db, notifications } from "@harly/db";

const BATCH_SIZE = 200;

type ExpiredDocument = {
  id: string;
  workspaceId: string;
  name: string;
  ownerId: string | null;
  createdById: string | null;
};

/**
 * Flip documents whose real-world validity (`expiresAt`) has lapsed to
 * `signatureStatus: "expired"`. Only touches `unsigned`/`signed` documents —
 * `pending` is left alone (an in-flight DocuSeal envelope's own expiry is
 * handled by the webhook/reconciliation cron), and `declined`/`expired` are
 * already terminal. Bypasses the manual-edit immutability guard in
 * `saveDocumentSignature` the same way the DocuSeal webhook does: this is a
 * system-driven transition, not a user edit.
 */
export async function expireOverdueDocuments(): Promise<{ expired: number }> {
  const rows = (await db.execute(sql`
    with due as (
      select "id" from "documents"
      where "status" = 'active'
        and "expires_at" is not null
        and "expires_at" <= now()
        and "signature_status" in ('unsigned', 'signed')
      order by "expires_at" asc
      limit ${BATCH_SIZE}
    )
    update "documents" as d
    set "signature_status" = 'expired', "updated_at" = now()
    from due
    where d."id" = due."id"
    returning d."id" as "id", d."workspace_id" as "workspace_id", d."name" as "name",
      d."owner_id" as "owner_id", d."created_by_id" as "created_by_id"
  `)) as unknown as ExpiredDocument[];

  if (rows.length === 0) return { expired: 0 };

  await db.transaction(async (tx) => {
    for (const doc of rows) {
      await tx.insert(activityEvents).values({
        workspaceId: doc.workspaceId,
        actorId: null,
        entityType: "document",
        entityId: doc.id,
        type: "document.expired",
        metadata: { name: doc.name },
      });

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
  });

  return { expired: rows.length };
}
