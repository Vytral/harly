import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

import { candidateFiles, db, offers, workspaceSettings } from "@harly/db";
import { getLocalUploadPath } from "@harly/storage";

import {
  connectCustomField,
  connectEnvelopeId,
  connectEventKey,
  verifyDocuSignHmac,
  type DocuSignConnectEvent,
} from "@/lib/docusign/connect";
import {
  freshDocuSignContext,
  getEnvelopeDocument,
} from "@/lib/docusign/client";
import { createLogger } from "@/lib/logger";
import { decideOfferForApi } from "@/features/offers/service";

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
 *  5. On completed: download the combined signed PDF and persist it as a
 *     candidate_file
 *  6. Respond 2xx fast. Connect retries + dedups; offer status monotonicity
 *     (only `sent` offers can be decided) is the natural idempotency guard.
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
    .select({ secret: workspaceSettings.docusignConnectSecret })
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
  const decision =
    eventName === "envelope-completed"
      ? "accepted"
      : eventName === "envelope-declined"
        ? "declined"
        : null;

  // Non-decision events (sent, delivered, voided, recipient-*): ack + skip.
  if (!decision) {
    return NextResponse.json({ ok: true, skipped: eventName });
  }

  // 4. Resolve the offer. Primary: envelopeId stored on the offer. Secondary:
  //    offerId custom field in the payload (redundant, requires includeData).
  const envelopeId = connectEnvelopeId(event);
  if (!envelopeId) {
    return NextResponse.json({ ok: true, skipped: "no envelopeId" });
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

  const offerConditions = [
    eq(offers.docusignEnvelopeId, envelopeId),
    eq(offers.workspaceId, workspaceId),
  ];

  const [offer] = await db
    .select({
      id: offers.id,
      status: offers.status,
      candidateId: offers.candidateId,
      createdById: offers.createdById,
      title: offers.title,
    })
    .from(offers)
    .where(and(...offerConditions))
    .limit(1);

  if (!offer) {
    log.warn({ envelopeId, workspaceId }, "docusign webhook: offer not found");
    return NextResponse.json({ ok: true, skipped: "offer not found" });
  }

  // Idempotency: only `sent` offers can be decided. A replay of a completed
  // event finds the offer already accepted/declined and skips cleanly.
  if (offer.status !== "sent") {
    return NextResponse.json({ ok: true, skipped: "already decided" });
  }

  log.info(
    { envelopeId, offerId: offer.id, decision, key: connectEventKey(event) },
    "docusign webhook: applying decision",
  );

  try {
    await decideOfferForApi({
      workspaceId,
      // Attribute the candidate's decision to the recruiter who sent the offer
      // (the webhook has no human actor; the offer creator started the flow).
      actorUserId: offer.createdById,
      offerId: offer.id,
      decision,
    });
  } catch (err) {
    log.error({ err, offerId: offer.id }, "docusign webhook: decideOffer failed");
    // 500 so Connect retries; a competing decision or expiry may have raced.
    return NextResponse.json(
      { error: "Could not apply decision." },
      { status: 500 },
    );
  }

  // 5. On completed, persist the signed PDF as a candidate file.
  if (decision === "accepted") {
    try {
      await persistSignedDocument(workspaceId, offer.candidateId, offer.id, envelopeId);
    } catch (err) {
      // The decision already applied — a PDF fetch failure should not make
      // Connect retry the whole event (which would hit the "already decided"
      // idempotency guard anyway). Log + ack.
      log.error({ err, envelopeId }, "docusign webhook: signed PDF persist failed");
    }
  }

  return NextResponse.json({ ok: true });
}

/** Download the combined signed PDF from DocuSign and store it locally. */
async function persistSignedDocument(
  workspaceId: string,
  candidateId: string,
  offerId: string,
  envelopeId: string,
): Promise<void> {
  const ctx = await freshDocuSignContext(workspaceId);
  if (!ctx) {
    log.warn({ workspaceId }, "docusign webhook: no context for PDF download");
    return;
  }

  // "combined" returns all envelope docs merged into one PDF.
  const res = await getEnvelopeDocument(
    ctx.baseUrl,
    ctx.accessToken,
    ctx.accountId,
    envelopeId,
    "combined",
  );
  const bytes = Buffer.from(await res.arrayBuffer());
  const contentHash = createHash("sha256").update(bytes).digest("hex");

  const fileName = `Offer signed.pdf`;
  const key = `workspaces/${workspaceId}/documents/${offerId}/signed.pdf`;

  if (process.env.STORAGE_PROVIDER === "s3") {
    // S3 adapter has no server-side putObject; the presign→PUT flow is
    // browser-side. For the webhook we fall back to local writes only.
    // TODO(docusign): add a server-side putObject to the storage adapter so
    // signed PDFs land in S3 too.
    log.warn(
      { workspaceId, envelopeId },
      "docusign webhook: S3 server-side write not implemented, skipping PDF persist",
    );
    return;
  }

  const uploadPath = getLocalUploadPath(key);
  await mkdir(dirname(uploadPath), { recursive: true });
  await writeFile(uploadPath, bytes);

  await db.insert(candidateFiles).values({
    workspaceId,
    candidateId,
    fileName,
    fileUrl: `/uploads/${key}`,
    fileType: "application/pdf",
    fileSize: bytes.byteLength,
    contentHash,
  });
}
