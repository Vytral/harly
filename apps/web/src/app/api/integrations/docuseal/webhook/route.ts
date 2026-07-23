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

import { createLogger } from "@/lib/logger";
import { decideOfferForApi } from "@/features/offers/service";
import { syncDocumentsForEnvelope } from "@/lib/esign/webhook-sync";
import {
  canAdvanceSignatureEnvelope,
  eventForDocusealWebhook,
  signatureEnvelopeStatusForEvent,
  type SignatureEnvelopeStatus,
} from "@/lib/esign/signature-state";
import {
  verifyDocusealSecret,
  webhookEventKey,
  webhookMetadata,
  webhookSubmissionId,
  webhookSubmissionStatus,
  type DocusealWebhookEvent,
} from "@/lib/esign/webhook";

const log = createLogger("api-docuseal-webhook");

export const runtime = "nodejs";

/**
 * POST /api/integrations/docuseal/webhook?ws=<workspaceId>&secret=<sharedSecret>
 *
 * DocuSeal posts submission/form status here (configured in the DocuSeal admin
 * webhook settings, one URL per workspace with its own secret). Authorization is
 * the per-workspace shared secret compared in constant time — DocuSeal has no
 * per-body HMAC on self-hosted by default. We:
 *  1. Verify the shared secret against the workspace's stored value.
 *  2. Parse the JSON payload; resolve the submission id.
 *  3. Dedupe by (submissionId, eventType, timestamp) via signature_events.
 *  4. Advance the envelope + recipients monotonically.
 *  5. On completion/decline, sync attached documents and flip the offer decision.
 */
export async function POST(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("ws");
  if (!workspaceId) {
    return NextResponse.json({ error: "Missing workspace." }, { status: 400 });
  }

  const [settings] = await db
    .select({ secret: workspaceSettings.docusealWebhookSecret })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);
  if (!settings?.secret) {
    return NextResponse.json({ error: "DocuSeal webhook not configured." }, { status: 404 });
  }

  const providedSecret =
    request.nextUrl.searchParams.get("secret") ??
    request.headers.get("x-docuseal-secret");
  if (!verifyDocusealSecret(providedSecret, settings.secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: DocusealWebhookEvent;
  try {
    event = (await request.json()) as DocusealWebhookEvent;
  } catch (err) {
    log.error(err, "docuseal webhook JSON parse failed");
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const eventType = event.event_type ?? "";
  const submissionId = webhookSubmissionId(event);
  if (!submissionId) {
    return NextResponse.json({ ok: true, skipped: "no submissionId" });
  }

  // Secondary integrity check: the submitter metadata workspaceId (when present)
  // must match the ?ws= owner.
  const metaWorkspaceId = webhookMetadata(event, "workspaceId");
  if (metaWorkspaceId && metaWorkspaceId !== workspaceId) {
    log.warn({ submissionId, wsParam: workspaceId, metaWorkspaceId }, "docuseal webhook: workspace mismatch");
    return NextResponse.json({ ok: true, skipped: "workspace mismatch" });
  }

  const eventKey = webhookEventKey(event);
  const signatureEnvelope = await ensureSignatureEnvelope({
    workspaceId,
    submissionId,
    offerId: webhookMetadata(event, "offerId"),
  });

  const [insertedEvent] = await db
    .insert(signatureEvents)
    .values({
      workspaceId,
      envelopeId: signatureEnvelope.id,
      eventKey,
      eventType,
      generatedAt: toDateOrNull(event.timestamp),
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

  const internalEvent = eventForDocusealWebhook(eventType, webhookSubmissionStatus(event));
  const envelopeStatus = internalEvent ? signatureEnvelopeStatusForEvent(internalEvent) : null;
  const documentSignatureStatus =
    envelopeStatus === "completed"
      ? "signed"
      : envelopeStatus === "declined" || envelopeStatus === "voided"
        ? "declined"
        : envelopeStatus === "sent" || envelopeStatus === "delivered"
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

    if (documentSignatureStatus) {
      await syncDocumentsForEnvelope({
        workspaceId,
        envelopeId: submissionId,
        signatureEnvelopeId: signatureEnvelope.id,
        signatureStatus: documentSignatureStatus,
        actorId: null,
      });
    }

    const decision =
      envelopeStatus === "completed"
        ? "accepted"
        : envelopeStatus === "declined"
          ? "declined"
          : null;
    if (!decision) {
      await markProcessed(recorded.id);
      return NextResponse.json({ ok: true, skipped: eventType });
    }

    const offer = await resolveOffer(workspaceId, signatureEnvelope.id, submissionId, webhookMetadata(event, "offerId"));
    if (!offer) {
      log.warn({ submissionId, workspaceId }, "docuseal webhook: offer not found");
      await markProcessed(recorded.id);
      return NextResponse.json({ ok: true, skipped: "offer not found" });
    }
    if (offer.status === "sent") {
      log.info({ submissionId, offerId: offer.id, decision }, "docuseal webhook: applying decision");
      await decideOfferForApi({
        workspaceId,
        actorUserId: offer.createdById,
        offerId: offer.id,
        decision,
      });
    }

    await markProcessed(recorded.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    await db
      .update(signatureEvents)
      .set({ processingError: err instanceof Error ? err.message : "Unknown processing error" })
      .where(eq(signatureEvents.id, recorded.id))
      .catch((updateError) => log.error(updateError, "docuseal webhook: event error update failed"));
    log.error({ err, submissionId, eventType }, "docuseal webhook processing failed");
    return NextResponse.json({ error: "Could not process DocuSeal event." }, { status: 500 });
  }
}

function toDateOrNull(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function resolveOffer(
  workspaceId: string,
  signatureEnvelopeId: string,
  submissionId: string,
  metaOfferId: string | null,
) {
  const cols = {
    id: offers.id,
    status: offers.status,
    candidateId: offers.candidateId,
    createdById: offers.createdById,
    title: offers.title,
  };
  let [offer] = await db
    .select(cols)
    .from(offers)
    .where(and(eq(offers.workspaceId, workspaceId), eq(offers.signatureEnvelopeRefId, signatureEnvelopeId)))
    .limit(1);
  if (!offer) {
    [offer] = await db
      .select(cols)
      .from(offers)
      .where(and(eq(offers.workspaceId, workspaceId), eq(offers.esignSubmissionId, submissionId)))
      .limit(1);
  }
  if (!offer && metaOfferId) {
    [offer] = await db
      .select(cols)
      .from(offers)
      .where(
        and(
          eq(offers.workspaceId, workspaceId),
          eq(offers.id, metaOfferId),
          or(isNull(offers.esignSubmissionId), eq(offers.esignSubmissionId, submissionId)),
        ),
      )
      .limit(1);
  }
  return offer;
}

async function ensureSignatureEnvelope(input: {
  workspaceId: string;
  submissionId: string;
  offerId: string | null;
}) {
  const [existing] = await db
    .select({ id: signatureEnvelopes.id })
    .from(signatureEnvelopes)
    .where(
      and(
        eq(signatureEnvelopes.workspaceId, input.workspaceId),
        eq(signatureEnvelopes.provider, "docuseal"),
        eq(signatureEnvelopes.providerEnvelopeId, input.submissionId),
      ),
    )
    .limit(1);
  if (existing) return existing;

  let [offer] = await db
    .select({ id: offers.id, title: offers.title, createdById: offers.createdById })
    .from(offers)
    .where(and(eq(offers.workspaceId, input.workspaceId), eq(offers.esignSubmissionId, input.submissionId)))
    .limit(1);
  if (!offer && input.offerId) {
    [offer] = await db
      .select({ id: offers.id, title: offers.title, createdById: offers.createdById })
      .from(offers)
      .where(
        and(
          eq(offers.workspaceId, input.workspaceId),
          eq(offers.id, input.offerId),
          or(isNull(offers.esignSubmissionId), eq(offers.esignSubmissionId, input.submissionId)),
        ),
      )
      .limit(1);
  }

  const [created] = await db
    .insert(signatureEnvelopes)
    .values({
      workspaceId: input.workspaceId,
      provider: "docuseal",
      providerEnvelopeId: input.submissionId,
      kind: offer ? "offer" : "document",
      offerId: offer?.id ?? null,
      subject: offer?.title ?? null,
      createdById: offer?.createdById ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: signatureEnvelopes.id });
  if (created) {
    if (offer) {
      await db
        .update(offers)
        .set({ esignSubmissionId: input.submissionId, signatureEnvelopeRefId: created.id, updatedAt: new Date() })
        .where(and(eq(offers.workspaceId, input.workspaceId), eq(offers.id, offer.id)));
    }
    return created;
  }

  const [raced] = await db
    .select({ id: signatureEnvelopes.id })
    .from(signatureEnvelopes)
    .where(
      and(
        eq(signatureEnvelopes.workspaceId, input.workspaceId),
        eq(signatureEnvelopes.provider, "docuseal"),
        eq(signatureEnvelopes.providerEnvelopeId, input.submissionId),
      ),
    )
    .limit(1);
  if (!raced) throw new Error("Signature envelope could not be resolved.");
  return raced;
}

async function applySignatureEnvelopeEvent(input: {
  workspaceId: string;
  envelopeId: string;
  event: DocusealWebhookEvent;
  eventKey: string;
  status: SignatureEnvelopeStatus | null;
}) {
  const eventDate = toDateOrNull(input.event.timestamp) ?? new Date();
  const data = input.event.data;

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: signatureEnvelopes.status })
      .from(signatureEnvelopes)
      .where(and(eq(signatureEnvelopes.id, input.envelopeId), eq(signatureEnvelopes.workspaceId, input.workspaceId)))
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
      if (input.status === "completed") values.completedAt = toDateOrNull(data?.completed_at ?? undefined) ?? eventDate;
      if (input.status === "declined") values.declinedAt = toDateOrNull(data?.declined_at ?? undefined) ?? eventDate;
      if (input.status === "voided") values.voidedAt = eventDate;
    }
    await tx
      .update(signatureEnvelopes)
      .set(values)
      .where(and(eq(signatureEnvelopes.id, input.envelopeId), eq(signatureEnvelopes.workspaceId, input.workspaceId)));

    // Reflect signer progress on the recipient row. Form events carry a single
    // submitter (data.email + data.status); submission events carry submitters[].
    // Match by email within this envelope — the stable business key we control.
    const signers = data?.submitters?.length
      ? data.submitters
      : data?.email
        ? [{ email: data.email, status: data.status, completed_at: data.completed_at, declined_at: data.declined_at }]
        : [];
    for (const signer of signers) {
      if (!signer.email) continue;
      const status = signer.status?.trim().toLowerCase() ?? "unknown";
      await tx
        .update(signatureRecipients)
        .set({
          status,
          signedAt: status === "completed" ? toDateOrNull(signer.completed_at ?? undefined) ?? eventDate : undefined,
          declinedAt: status === "declined" ? toDateOrNull(signer.declined_at ?? undefined) ?? eventDate : undefined,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(signatureRecipients.workspaceId, input.workspaceId),
            eq(signatureRecipients.envelopeId, input.envelopeId),
            eq(signatureRecipients.email, signer.email.trim().toLowerCase()),
          ),
        );
    }
  });
}

async function markProcessed(eventId: string) {
  await db
    .update(signatureEvents)
    .set({ processedAt: new Date(), processingError: null })
    .where(eq(signatureEvents.id, eventId));
}
