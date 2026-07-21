import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull, or } from "drizzle-orm";

import {
  db,
  offers,
  signatureEnvelopes,
  signatureEvents,
  signatureRecipients,
  workspaceSettings,
} from "@harly/db";

import {
  connectCustomField,
  connectEnvelopeId,
  connectEventKey,
  verifyDocuSignHmac,
  type DocuSignConnectEvent,
} from "@/lib/docusign/connect";
import { createLogger } from "@/lib/logger";
import { decideOfferForApi } from "@/features/offers/service";
import { syncDocumentsForEnvelope } from "@/lib/docusign/webhook-sync";
import {
  canAdvanceSignatureEnvelope,
  signatureEnvelopeStatusForEvent,
  type SignatureEnvelopeStatus,
} from "@/lib/docusign/signature-state";

const log = createLogger("api-docusign-webhook");

export const runtime = "nodejs";

/**
 * POST /api/integrations/docusign/webhook?ws=<workspaceId>
 *
 * DocuSign Connect posts envelope status here (configured inline per envelope
 * via eventNotification). Authorization is the account-global Connect HMAC
 * secret (X-DocuSign-Signature-N), NOT a session. We:
 *  1. Read the RAW body bytes (before any JSON parse — HMAC is over raw bytes)
 *  2. Verify the HMAC against the workspace's active Connect secret(s)
 *  3. Parse the JSON SIM payload
 *  4. On `envelope-completed` / `envelope-declined`: resolve the offer by
 *     envelopeId (primary) or offerId custom field (secondary), flip its
 *     decision via decideOfferForApi (no session — actor = offer creator)
 *  5. Persist the envelope state synchronously; the scheduler reconciles
 *     completed artifacts out of band so Connect receives a fast 2xx.
 *  6. Respond 2xx after the state transition. Connect retries are deduped by
 *     event key and document signature states are monotonic.
 */
export async function POST(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("ws");
  if (!workspaceId) {
    return NextResponse.json({ error: "Missing workspace." }, { status: 400 });
  }

  // 1. Raw body — MUST be captured before JSON parse for HMAC.
  const rawBody = Buffer.from(await request.arrayBuffer());

  // 2. Resolve + verify HMAC. Support comma-separated secrets for rotation.
  const [settings] = await db
    .select({
      secret: workspaceSettings.docusignConnectSecret,
      accountId: workspaceSettings.docusignAccountId,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (!settings?.secret) {
    return NextResponse.json(
      { error: "DocuSign Connect not configured." },
      { status: 404 },
    );
  }
  const secrets = settings.secret
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const headers: Record<string, string | string[] | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  if (!verifyDocuSignHmac(rawBody, headers, secrets)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  // 3. Parse.
  let event: DocuSignConnectEvent;
  try {
    event = JSON.parse(rawBody.toString("utf8")) as DocuSignConnectEvent;
  } catch (err) {
    log.error(err, "docusign webhook JSON parse failed");
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const eventName = event.event ?? "";
  const envelopeId = connectEnvelopeId(event);
  if (!envelopeId) {
    return NextResponse.json({ ok: true, skipped: "no envelopeId" });
  }

  if (!settings.accountId || event.data?.accountId !== settings.accountId) {
    log.warn({ workspaceId, envelopeId }, "docusign webhook: account mismatch");
    return NextResponse.json({ ok: true, skipped: "account mismatch" });
  }

  const customWorkspaceId = connectCustomField(event, "workspaceId");
  // Secondary integrity check: the envelope's stored workspaceId (if present
  // in the payload) must match the webhook's ?ws= owner.
  if (customWorkspaceId && customWorkspaceId !== workspaceId) {
    log.warn(
      { envelopeId, wsParam: workspaceId, customWorkspaceId },
      "docusign webhook: workspaceId mismatch",
    );
    return NextResponse.json({ ok: true, skipped: "workspace mismatch" });
  }

  const eventKey = connectEventKey(event);
  const signatureEnvelope = await ensureSignatureEnvelope({
    workspaceId,
    envelopeId,
    offerId: connectCustomField(event, "offerId"),
  });
  const [insertedEvent] = await db
    .insert(signatureEvents)
    .values({
      workspaceId,
      envelopeId: signatureEnvelope.id,
      eventKey,
      eventType: eventName,
      generatedAt: toDateOrNull(event.generatedDateTime),
      retryCount: event.retryCount ?? null,
      payload: event,
    })
    .onConflictDoNothing()
    .returning({ id: signatureEvents.id, processedAt: signatureEvents.processedAt });
  let recorded = insertedEvent;
  if (!recorded) {
    const [existingEvent] = await db
      .select({ id: signatureEvents.id, processedAt: signatureEvents.processedAt })
      .from(signatureEvents)
      .where(and(eq(signatureEvents.workspaceId, workspaceId), eq(signatureEvents.eventKey, eventKey)))
      .limit(1);
    if (!existingEvent || existingEvent.processedAt) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    recorded = existingEvent;
  }

  const envelopeStatus = signatureEnvelopeStatusForEvent(eventName);
  const documentSignatureStatus =
    eventName === "envelope-completed"
      ? "signed"
      : eventName === "envelope-declined" || eventName === "envelope-voided"
        ? "declined"
        : eventName === "envelope-sent" || eventName === "envelope-delivered"
          ? "pending"
          : null;

  try {
    await applySignatureEnvelopeEvent({
      workspaceId,
      envelopeId: signatureEnvelope.id,
      event,
      eventKey,
      status: envelopeStatus,
    });
    // PDF/certificate retrieval can be slow and must not make Connect retry a
    // valid event. The reconciliation worker sees completed envelopes with a
    // due `nextReconcileAt` and performs the durable artifact sync.
    if (documentSignatureStatus && documentSignatureStatus !== "signed") {
      await syncDocumentsForEnvelope({
        workspaceId,
        envelopeId,
        signatureEnvelopeId: signatureEnvelope.id,
        signatureStatus: documentSignatureStatus,
        actorId: null,
      });
    }

    const decision =
      eventName === "envelope-completed"
        ? "accepted"
        : eventName === "envelope-declined"
          ? "declined"
          : null;
    if (!decision) {
      await markSignatureEventProcessed(recorded.id);
      return NextResponse.json({ ok: true, skipped: eventName });
    }

    let [offer] = await db
      .select({
        id: offers.id,
        status: offers.status,
        candidateId: offers.candidateId,
        createdById: offers.createdById,
        title: offers.title,
      })
      .from(offers)
      .where(and(eq(offers.workspaceId, workspaceId), eq(offers.signatureEnvelopeRefId, signatureEnvelope.id)))
      .limit(1);
    if (!offer) {
      [offer] = await db
        .select({
          id: offers.id,
          status: offers.status,
          candidateId: offers.candidateId,
          createdById: offers.createdById,
          title: offers.title,
        })
        .from(offers)
        .where(and(eq(offers.workspaceId, workspaceId), eq(offers.docusignEnvelopeId, envelopeId)))
        .limit(1);
    }

    // Envelope id is authoritative. The opaque offerId custom field is only a
    // fallback for envelopes created before the primary correlation was saved.
    const offerId = connectCustomField(event, "offerId");
    if (!offer && offerId) {
      [offer] = await db
        .select({
          id: offers.id,
          status: offers.status,
          candidateId: offers.candidateId,
          createdById: offers.createdById,
          title: offers.title,
        })
        .from(offers)
        .where(and(
          eq(offers.workspaceId, workspaceId),
          eq(offers.id, offerId),
          or(isNull(offers.docusignEnvelopeId), eq(offers.docusignEnvelopeId, envelopeId)),
        ))
        .limit(1);
    }

    if (!offer) {
      log.warn({ envelopeId, workspaceId }, "docusign webhook: offer not found");
      await markSignatureEventProcessed(recorded.id);
      return NextResponse.json({ ok: true, skipped: "offer not found" });
    }

    if (offer.status === "sent") {
      log.info(
        { envelopeId, offerId: offer.id, decision, key: eventKey },
        "docusign webhook: applying decision",
      );
      await decideOfferForApi({
        workspaceId,
        actorUserId: offer.createdById,
        offerId: offer.id,
        decision,
      });
    }

    await markSignatureEventProcessed(recorded.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    await db
      .update(signatureEvents)
      .set({
        processingError: err instanceof Error ? err.message : "Unknown processing error",
      })
      .where(eq(signatureEvents.id, recorded.id))
      .catch((updateError) => log.error(updateError, "docusign webhook: event error update failed"));
    log.error({ err, envelopeId, eventName }, "docusign webhook processing failed");
    return NextResponse.json({ error: "Could not process DocuSign event." }, { status: 500 });
  }
}

function toDateOrNull(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function ensureSignatureEnvelope(input: {
  workspaceId: string;
  envelopeId: string;
  offerId: string | null;
}) {
  const [existing] = await db
    .select({ id: signatureEnvelopes.id, offerId: signatureEnvelopes.offerId })
    .from(signatureEnvelopes)
    .where(
      and(
        eq(signatureEnvelopes.workspaceId, input.workspaceId),
        eq(signatureEnvelopes.provider, "docusign"),
        eq(signatureEnvelopes.providerEnvelopeId, input.envelopeId),
      ),
    )
    .limit(1);
  if (existing) return existing;

  let [offer] = await db
    .select({
      id: offers.id,
      title: offers.title,
      createdById: offers.createdById,
    })
    .from(offers)
    .where(
      and(
        eq(offers.workspaceId, input.workspaceId),
        eq(offers.docusignEnvelopeId, input.envelopeId),
      ),
    )
    .limit(1);
  if (!offer && input.offerId) {
    [offer] = await db
      .select({
        id: offers.id,
        title: offers.title,
        createdById: offers.createdById,
      })
      .from(offers)
      .where(
        and(
          eq(offers.workspaceId, input.workspaceId),
          eq(offers.id, input.offerId),
          or(
            isNull(offers.docusignEnvelopeId),
            eq(offers.docusignEnvelopeId, input.envelopeId),
          ),
        ),
      )
      .limit(1);
  }

  const [created] = await db
    .insert(signatureEnvelopes)
    .values({
      workspaceId: input.workspaceId,
      provider: "docusign",
      providerEnvelopeId: input.envelopeId,
      kind: offer ? "offer" : "document",
      offerId: offer?.id ?? null,
      subject: offer?.title ?? null,
      createdById: offer?.createdById ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: signatureEnvelopes.id, offerId: signatureEnvelopes.offerId });
  if (created) {
    if (offer) {
      await db
        .update(offers)
        .set({
          docusignEnvelopeId: input.envelopeId,
          signatureEnvelopeRefId: created.id,
          updatedAt: new Date(),
        })
        .where(and(eq(offers.workspaceId, input.workspaceId), eq(offers.id, offer.id)));
    }
    return created;
  }

  const [raced] = await db
    .select({ id: signatureEnvelopes.id, offerId: signatureEnvelopes.offerId })
    .from(signatureEnvelopes)
    .where(
      and(
        eq(signatureEnvelopes.workspaceId, input.workspaceId),
        eq(signatureEnvelopes.provider, "docusign"),
        eq(signatureEnvelopes.providerEnvelopeId, input.envelopeId),
      ),
    )
    .limit(1);
  if (!raced) throw new Error("Signature envelope could not be resolved.");
  if (offer) {
    await db
      .update(offers)
      .set({
        docusignEnvelopeId: input.envelopeId,
        signatureEnvelopeRefId: raced.id,
        updatedAt: new Date(),
      })
      .where(and(eq(offers.workspaceId, input.workspaceId), eq(offers.id, offer.id)));
  }
  return raced;
}

async function applySignatureEnvelopeEvent(input: {
  workspaceId: string;
  envelopeId: string;
  event: DocuSignConnectEvent;
  eventKey: string;
  status: SignatureEnvelopeStatus | null;
}) {
  const eventDate = toDateOrNull(input.event.generatedDateTime) ?? new Date();
  const summary = input.event.data?.envelopeSummary;
  const signers = summary?.recipients?.signers ?? [];

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: signatureEnvelopes.status })
      .from(signatureEnvelopes)
      .where(
        and(
          eq(signatureEnvelopes.id, input.envelopeId),
          eq(signatureEnvelopes.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!current) throw new Error("Signature envelope disappeared during processing.");

    const values: Partial<typeof signatureEnvelopes.$inferInsert> = {
      lastEventAt: eventDate,
      lastEventKey: input.eventKey,
      nextReconcileAt: new Date(),
      reconcileError: null,
      updatedAt: new Date(),
    };
    if (input.status && canAdvanceSignatureEnvelope(current.status, input.status)) {
      values.status = input.status;
      if (input.status === "sent") values.sentAt = eventDate;
      if (input.status === "delivered") values.deliveredAt = eventDate;
      if (input.status === "completed") values.completedAt = toDateOrNull(summary?.completedDateTime) ?? eventDate;
      if (input.status === "declined") values.declinedAt = toDateOrNull(summary?.declinedDateTime) ?? eventDate;
      if (input.status === "voided") values.voidedAt = toDateOrNull(summary?.voidedDateTime) ?? eventDate;
    }
    await tx
      .update(signatureEnvelopes)
      .set(values)
      .where(
        and(
          eq(signatureEnvelopes.id, input.envelopeId),
          eq(signatureEnvelopes.workspaceId, input.workspaceId),
        ),
      );

    const recipientRows = signers
      .filter((signer) => signer.recipientId && signer.email && signer.name)
      .map((signer) => ({
        workspaceId: input.workspaceId,
        envelopeId: input.envelopeId,
        providerRecipientId: signer.recipientId as string,
        role: "signer",
        email: signer.email as string,
        name: signer.name as string,
        routingOrder: 1,
        status: signer.status?.toLowerCase() ?? "unknown",
        signedAt: signer.status?.toLowerCase() === "completed" ? eventDate : null,
        declinedAt: signer.status?.toLowerCase() === "declined" ? eventDate : null,
        declinedReason: signer.declinedReason ?? null,
        updatedAt: new Date(),
    }));
    if (recipientRows.length > 0) {
      for (const recipient of recipientRows) {
        await tx
          .insert(signatureRecipients)
          .values(recipient)
          .onConflictDoUpdate({
            target: [signatureRecipients.envelopeId, signatureRecipients.providerRecipientId],
            set: {
              status: recipient.status,
              signedAt: recipient.signedAt,
              declinedAt: recipient.declinedAt,
              declinedReason: recipient.declinedReason,
              updatedAt: new Date(),
            },
          });
      }
    }
  });
}

async function markSignatureEventProcessed(eventId: string) {
  await db
    .update(signatureEvents)
    .set({ processedAt: new Date(), processingError: null })
    .where(eq(signatureEvents.id, eventId));
}

/**
 * Download the completed envelope and create one immutable signed artifact in
 * the Documents hub. The envelope id makes this operation idempotent.
 */
