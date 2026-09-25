import "dotenv/config";

import { and, eq, isNull, isNotNull, like } from "drizzle-orm";

import { createDatabaseClient, schema } from "../src";

// Canonical default box — must match the client-side default used across
// PortalOfferSignDialog / NativeSignWorkspace / NativeSigningPage.
const DEFAULT_FIELD = {
  type: "signature" as const,
  page: 1,
  x: 0.08,
  y: 0.72,
  w: 0.26,
  h: 0.06,
  label: null as string | null,
  required: true,
  order: 0,
};

/**
 * Seeds a frozen fieldsSnapshot (plus a matching draft signatureFields row)
 * for every in-flight native document/offer that predates the recruiter
 * field-placement feature. Idempotent and concurrency-safe: each document is
 * processed inside a transaction that `SELECT ... FOR UPDATE`s the documents
 * row and rechecks `fieldsSnapshot IS NULL` under that lock before writing —
 * a concurrent racer blocks on the lock, then sees the snapshot already set
 * once it acquires it, and does nothing. (A first cut of this script used a
 * `WHERE NOT EXISTS` guard without a row lock — verified racy under a real
 * concurrent run, which is why this is a proper lock instead.)
 *
 * Run once right after the schema migration ships, and again right before
 * the recruiter placement UI ships (to sweep up anything sent in between).
 */
async function main() {
  const { db, sql } = createDatabaseClient();

  try {
    // 1. In-flight native documents sent directly from the Documents Hub.
    const pendingDocuments = await db
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.signatureStatus, "pending"),
          eq(schema.documents.signatureProvider, "native"),
          isNull(schema.documents.fieldsSnapshot),
        ),
      );

    // 2. In-flight native offers — resolve to their offer-letter documentId
    // via documentAssociations, same as getOrCreateNativeOfferDocument does.
    const pendingOfferDocuments = await db
      .select({ id: schema.documentAssociations.documentId })
      .from(schema.offers)
      .innerJoin(
        schema.documentAssociations,
        and(
          eq(schema.documentAssociations.targetType, "offer_letter"),
          eq(schema.documentAssociations.targetId, schema.offers.id),
          eq(schema.documentAssociations.workspaceId, schema.offers.workspaceId),
        ),
      )
      .innerJoin(
        schema.documents,
        and(
          eq(schema.documents.id, schema.documentAssociations.documentId),
          isNull(schema.documents.fieldsSnapshot),
        ),
      )
      .where(
        and(
          eq(schema.offers.status, "sent"),
          isNotNull(schema.offers.esignSubmissionId),
          like(schema.offers.esignSubmissionId, "native:%"),
        ),
      );

    const documentIds = Array.from(
      new Set([
        ...pendingDocuments.map((d) => d.id),
        ...pendingOfferDocuments.map((d) => d.id),
      ]),
    );

    if (documentIds.length === 0) {
      console.log("No in-flight native documents/offers missing a fields snapshot. Nothing to do.");
      return;
    }

    let seeded = 0;
    for (const documentId of documentIds) {
      const didSeed = await db.transaction(async (tx) => {
        // Lock the documents row first and recheck under the lock — this is
        // the actual concurrency guard. A racer's SELECT ... FOR UPDATE
        // blocks here until this transaction commits, then sees the snapshot
        // already set and returns no row, so it correctly does nothing.
        const [locked] = await tx
          .select({ id: schema.documents.id, workspaceId: schema.documents.workspaceId })
          .from(schema.documents)
          .where(and(eq(schema.documents.id, documentId), isNull(schema.documents.fieldsSnapshot)))
          .for("update")
          .limit(1);
        if (!locked) return false;

        const [fieldRow] = await tx
          .insert(schema.signatureFields)
          .values({
            workspaceId: locked.workspaceId,
            documentId: locked.id,
            ...DEFAULT_FIELD,
          })
          .returning();

        await tx
          .update(schema.documents)
          .set({ fieldsSnapshot: [fieldRow] })
          .where(eq(schema.documents.id, locked.id));

        return true;
      });

      if (didSeed) seeded += 1;
    }

    console.log(`Backfilled a default fields snapshot for ${seeded} document(s).`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Signature fields backfill failed.");
  console.error(error);
  process.exit(1);
});
