import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";

import {
  db,
  offers,
  signatureEnvelopes,
  signatureEvents,
} from "@harly/db";

import {
  getEnvelope,
  freshDocuSignContext,
} from "@/lib/docusign/client";
import {
  canAdvanceSignatureEnvelope,
  signatureEnvelopeStatusForEvent,
  signatureEventForProviderStatus,
  signatureReconcileDelayMs,
} from "@/lib/docusign/signature-state";
import { syncEnvelopeRecipients } from "@/lib/docusign/recipient-sync";
import { syncDocumentsForEnvelope } from "@/lib/docusign/webhook-sync";
import { decideOfferForApi } from "@/features/offers/service";
import { createLogger } from "@/lib/logger";
import { authorizeCron } from "@/server/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "docusign-reconciliation";
const BATCH_SIZE = 50;
const LOCK_MS = 2 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 1000;

const log = createLogger("cron-docusign-reconciliation");

function toDateOrNull(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dueEnvelopeCondition(now: Date) {
  return and(
    eq(signatureEnvelopes.provider, "docusign"),
    inArray(signatureEnvelopes.status, [
      "sent",
      "delivered",
      "completed",
      "declined",
      "voided",
    ]),
    or(
      isNull(signatureEnvelopes.nextReconcileAt),
      lte(signatureEnvelopes.nextReconcileAt, now),
    ),
    or(
      isNull(signatureEnvelopes.reconcileLockedUntil),
      lt(signatureEnvelopes.reconcileLockedUntil, now),
    ),
  );
}

async function claimEnvelope(
  envelope: typeof signatureEnvelopes.$inferSelect,
  now: Date,
) {
  const [claimed] = await db
    .update(signatureEnvelopes)
    .set({
      reconcileLockedUntil: new Date(now.getTime() + LOCK_MS),
      updatedAt: now,
    })
    .where(
      and(
        eq(signatureEnvelopes.id, envelope.id),
        dueEnvelopeCondition(now),
      ),
    )
    .returning({ id: signatureEnvelopes.id });
  return Boolean(claimed);
}

async function finishEnvelope(input: {
  envelopeId: string;
  attempts: number;
  now: Date;
  nextAt: Date;
  error?: string | null;
}) {
  await db
    .update(signatureEnvelopes)
    .set({
      lastReconciledAt: input.now,
      nextReconcileAt: input.nextAt,
      reconcileLockedUntil: null,
      reconcileAttempts: input.attempts,
      reconcileError: input.error ?? null,
      updatedAt: input.now,
    })
    .where(eq(signatureEnvelopes.id, input.envelopeId));
}

async function reconcileEnvelope(envelope: typeof signatureEnvelopes.$inferSelect) {
  const now = new Date();
  const attempts = envelope.reconcileAttempts + 1;
  try {
    const context = await freshDocuSignContext(envelope.workspaceId);
    if (!context) throw new Error("DocuSign connection is unavailable.");
    const remote = await getEnvelope(
      context.baseUrl,
      context.accessToken,
      context.accountId,
      envelope.providerEnvelopeId,
    );
    await syncEnvelopeRecipients({
      workspaceId: envelope.workspaceId,
      signatureEnvelopeId: envelope.id,
      baseUrl: context.baseUrl,
      accessToken: context.accessToken,
      accountId: context.accountId,
      providerEnvelopeId: envelope.providerEnvelopeId,
    });
    const eventName = signatureEventForProviderStatus(remote.status);
    const nextStatus = signatureEnvelopeStatusForEvent(eventName ?? "");
    const generatedAt =
      toDateOrNull(remote.completedDateTime ?? remote.declinedDateTime) ?? now;
    const eventKey = [
      "reconcile",
      envelope.id,
      remote.status ?? "unknown",
      remote.completedDateTime ?? remote.declinedDateTime ?? "",
    ].join(":");

    const [recorded] = await db
      .insert(signatureEvents)
      .values({
        workspaceId: envelope.workspaceId,
        envelopeId: envelope.id,
        eventKey,
        eventType: `reconciliation:${remote.status ?? "unknown"}`,
        generatedAt,
        retryCount: attempts,
        payload: {
          source: "docusign-reconciliation",
          provider: envelope.provider,
          providerEnvelopeId: envelope.providerEnvelopeId,
          status: remote.status ?? null,
          completedDateTime: remote.completedDateTime ?? null,
          declinedDateTime: remote.declinedDateTime ?? null,
          declinedReason: remote.declinedReason ?? null,
        },
      })
      .onConflictDoNothing()
      .returning({ id: signatureEvents.id });
    let reconciliationEventId = recorded?.id ?? null;
    if (!reconciliationEventId) {
      const [existingEvent] = await db
        .select({ id: signatureEvents.id })
        .from(signatureEvents)
        .where(
          and(
            eq(signatureEvents.workspaceId, envelope.workspaceId),
            eq(signatureEvents.eventKey, eventKey),
          ),
        )
        .limit(1);
      reconciliationEventId = existingEvent?.id ?? null;
    }

    if (nextStatus) {
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ status: signatureEnvelopes.status })
          .from(signatureEnvelopes)
          .where(eq(signatureEnvelopes.id, envelope.id))
          .limit(1);
        if (!current) throw new Error("Signature envelope disappeared during reconciliation.");
        const values: Partial<typeof signatureEnvelopes.$inferInsert> = {
          lastEventAt: generatedAt,
          lastEventKey: eventKey,
          updatedAt: now,
        };
        if (canAdvanceSignatureEnvelope(current.status, nextStatus)) {
          values.status = nextStatus;
          if (nextStatus === "sent") values.sentAt = generatedAt;
          if (nextStatus === "delivered") values.deliveredAt = generatedAt;
          if (nextStatus === "completed") values.completedAt = generatedAt;
          if (nextStatus === "declined") values.declinedAt = generatedAt;
          if (nextStatus === "voided") values.voidedAt = generatedAt;
        }
        await tx
          .update(signatureEnvelopes)
          .set(values)
          .where(eq(signatureEnvelopes.id, envelope.id));
      });

      const signatureStatus =
        nextStatus === "completed"
          ? "signed"
          : nextStatus === "declined" || nextStatus === "voided"
            ? "declined"
            : "pending";
      await syncDocumentsForEnvelope({
        workspaceId: envelope.workspaceId,
        envelopeId: envelope.providerEnvelopeId,
        signatureEnvelopeId: envelope.id,
        signatureStatus,
        actorId: null,
        source: "reconciliation",
      });

      if (nextStatus === "completed" || nextStatus === "declined") {
        const [offer] = await db
          .select({
            id: offers.id,
            status: offers.status,
            createdById: offers.createdById,
          })
          .from(offers)
          .where(
            and(
              eq(offers.workspaceId, envelope.workspaceId),
              or(
                eq(offers.signatureEnvelopeRefId, envelope.id),
                eq(offers.docusignEnvelopeId, envelope.providerEnvelopeId),
              ),
            ),
          )
          .limit(1);
        if (offer?.status === "sent") {
          await decideOfferForApi({
            workspaceId: envelope.workspaceId,
            actorUserId: offer.createdById,
            offerId: offer.id,
            decision: nextStatus === "completed" ? "accepted" : "declined",
          });
        }
      }
    }

    if (reconciliationEventId) {
      await db
        .update(signatureEvents)
        .set({ processedAt: new Date(), processingError: null })
        .where(eq(signatureEvents.id, reconciliationEventId));
    }
    await finishEnvelope({
      envelopeId: envelope.id,
      attempts,
      now,
      nextAt: new Date(now.getTime() + signatureReconcileDelayMs(remote.status)),
    });
    return "succeeded" as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown reconciliation error.";
    await finishEnvelope({
      envelopeId: envelope.id,
      attempts,
      now,
      nextAt: new Date(now.getTime() + FAILURE_RETRY_MS),
      error: message,
    });
    log.error({ error, envelopeId: envelope.providerEnvelopeId }, "DocuSign reconciliation failed");
    return "failed" as const;
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  try {
    const now = new Date();
    const candidates = await db
      .select()
      .from(signatureEnvelopes)
      .where(dueEnvelopeCondition(now))
      .orderBy(desc(signatureEnvelopes.nextReconcileAt))
      .limit(BATCH_SIZE);
    const claimed = [] as typeof candidates;
    for (const envelope of candidates) {
      if (await claimEnvelope(envelope, now)) claimed.push(envelope);
    }
    const results = [] as Array<"succeeded" | "failed">;
    for (const envelope of claimed) {
      results.push(await reconcileEnvelope(envelope));
    }
    return NextResponse.json({
      ok: true,
      claimed: claimed.length,
      succeeded: results.filter((result) => result === "succeeded").length,
      failed: results.filter((result) => result === "failed").length,
    });
  } finally {
    await auth.release();
  }
}
