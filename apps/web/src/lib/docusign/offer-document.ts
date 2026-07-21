import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import {
  activityEvents,
  db,
  documentAssociations,
  documents,
  offers,
  signatureEnvelopes,
  signatureRecipients,
  type Offer,
} from "@harly/db";

import {
  createEnvelope,
  freshDocuSignContext,
  getDocuSignEnvelopeUrl,
  type CreateEnvelopeInput,
} from "@/lib/docusign/client";
import { createLogger } from "@/lib/logger";
import { getWorkspaceDocuSignConfig } from "@/lib/docusign/config";
import { getDocuSignWebhookBaseUrl } from "@/lib/public-origin";
import { getOfferRecipient } from "@/features/offers/core";
import { formatOfferComp } from "@/features/offers/shared";
import { storage } from "@/lib/storage";

const log = createLogger("docusign-offer-document");

/**
 * DocuSign offer flow: build the offer as an HTML document (no PDF render dep),
 * create a DocuSign envelope with the candidate as an embedded signer, and wire
 * the Connect webhook. The signed PDF is downloaded by the webhook on
 * `envelope-completed` and attached to the candidate. See
 * docs-internal/docusign-api-reference.md.
 */

function fmtDate(value: Date | string | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
  }).format(d);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function documentExtension(mimeType: string): string {
  const extensionByMime: Record<string, string> = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  return extensionByMime[mimeType] ?? "";
}

/**
 * Build the offer letter as an HTML string for the DocuSign envelope document.
 * Plain, branded-ish letter with the terms table and a signature line. DocuSign
 * renders this; the signHere tab is placed near the bottom.
 */
export function buildOfferHtml(input: {
  candidateName: string;
  companyName: string;
  jobTitle: string;
  salary: string | null;
  equity: string | null;
  startDate: string | null;
  expiresAt: string | null;
  notes: string | null;
}): string {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Role", value: escapeHtml(input.jobTitle) },
    ...(input.salary
      ? [{ label: "Compensation", value: escapeHtml(input.salary) }]
      : []),
    ...(input.equity
      ? [{ label: "Equity", value: escapeHtml(input.equity) }]
      : []),
    ...(input.startDate
      ? [{ label: "Start date", value: escapeHtml(input.startDate) }]
      : []),
    ...(input.expiresAt
      ? [{ label: "Respond by", value: escapeHtml(input.expiresAt) }]
      : []),
  ];

  const tableRows = rows
    .map(
      (r) =>
        `<tr><td style="padding:10px 12px;color:#44520f;font-size:14px;border-bottom:1px solid rgba(68,82,15,0.12)">${r.label}</td><td style="padding:10px 12px;color:#171717;font-size:14px;font-weight:600;border-bottom:1px solid rgba(68,82,15,0.12)">${r.value}</td></tr>`,
    )
    .join("");

  const notesBlock = input.notes
    ? `<p style="font-size:14px;color:#3f3f46;line-height:1.6;white-space:pre-wrap">${escapeHtml(input.notes)}</p>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:Inter,Helvetica,Arial,sans-serif;color:#171717;max-width:640px;margin:0 auto;padding:32px}
  h1{font-size:28px;font-weight:600;letter-spacing:-0.5px;margin:0 0 8px}
  .sub{color:#52525b;font-size:14px;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;background:#eaf6c8;border-radius:12px;overflow:hidden;margin:16px 0 24px}
  p{font-size:14px;color:#3f3f46;line-height:1.6}
  .sig{margin-top:48px}
  .line{border-top:1px solid #52525b;width:280px;margin-bottom:6px}
  .label{color:#52525b;font-size:12px}
</style></head><body>
  <h1>Offer of employment</h1>
  <div class="sub">${escapeHtml(input.companyName)}</div>
  <p>Dear ${escapeHtml(input.candidateName)},</p>
  <p>We are delighted to offer you the position of <strong>${escapeHtml(input.jobTitle)}</strong> at ${escapeHtml(input.companyName)}. Below are the terms of your offer.</p>
  <table><tbody>${tableRows}</tbody></table>
  ${notesBlock}
  <p>To accept this offer, please sign below. We are excited to have you join the team.</p>
  <div class="sig">
    <div class="line"></div>
    <div class="label">Signature</div>
  </div>
</body></html>`;
}

/**
 * Create a DocuSign envelope for an offer and persist the envelopeId on the
 * offer row. Returns the envelopeId, or null when DocuSign is not configured
 * for the workspace (caller should fall back to email-only).
 */
export async function createOfferEnvelope(input: {
  workspaceId: string;
  offer: Offer;
}): Promise<string | null> {
  if (input.offer.docusignEnvelopeId) {
    return input.offer.docusignEnvelopeId;
  }
  const config = await getWorkspaceDocuSignConfig(input.workspaceId);
  if (!config || config.offerSignatureChannel !== "docusign") {
    return null;
  }
  if (!config.connectSecret) {
    throw new Error("Configure the DocuSign Connect HMAC key before sending signed offers.");
  }

  const ctx = await freshDocuSignContext(input.workspaceId);
  if (!ctx) {
    log.warn(
      { workspaceId: input.workspaceId, offerId: input.offer.id },
      "createOfferEnvelope: DocuSign not connected",
    );
    return null;
  }

  const recipient = await getOfferRecipient(input.workspaceId, input.offer.candidateId);
  if (!recipient?.email) {
    log.warn(
      { offerId: input.offer.id },
      "createOfferEnvelope: candidate has no email",
    );
    return null;
  }
  const recipientEmail = recipient.email;

  const candidateName =
    [recipient.firstName, recipient.lastName].filter(Boolean).join(" ") ||
    recipient.email;

  const salary = formatOfferComp({
    salaryAmount: input.offer.salaryAmount,
    currency: input.offer.currency,
    salaryPeriod: input.offer.salaryPeriod,
  });

  const html = buildOfferHtml({
    candidateName,
    companyName: recipient.companyName ?? "the team",
    jobTitle: input.offer.title,
    salary,
    equity: input.offer.equity,
    startDate: fmtDate(input.offer.startDate),
    expiresAt: fmtDate(input.offer.expiresAt),
    notes: input.offer.notes,
  });

  const webhookUrl = `${getDocuSignWebhookBaseUrl()}?ws=${encodeURIComponent(input.workspaceId)}`;

  const attachedDocuments = await db
    .select({
      id: documents.id,
      name: documents.name,
      mimeType: documents.mimeType,
      storageKey: documents.storageKey,
      signatureStatus: documents.signatureStatus,
    })
    .from(documentAssociations)
    .innerJoin(documents, eq(documents.id, documentAssociations.documentId))
    .where(
      and(
        eq(documentAssociations.workspaceId, input.workspaceId),
        eq(documentAssociations.targetType, "offer"),
        eq(documentAssociations.targetId, input.offer.id),
        eq(documents.workspaceId, input.workspaceId),
        eq(documents.status, "active"),
      ),
    );

  if (attachedDocuments.some((document) => ["signed", "pending"].includes(document.signatureStatus))) {
    throw new Error("One or more attached documents already has an active DocuSign envelope.");
  }

  let attachedBytes = 0;
  const envelopeDocuments: CreateEnvelopeInput["documents"] = [
    {
      documentId: "1",
      name: "Offer.html",
      fileExtension: "html",
      htmlDefinition: {
        source: "embedded",
        documentBase64: Buffer.from(html, "utf8").toString("base64"),
      },
    },
  ];
  for (const document of attachedDocuments) {
    const extension = documentExtension(document.mimeType);
    if (!extension) throw new Error(`Unsupported DocuSign document type: ${document.mimeType}`);
    const bytes = await storage.read(document.storageKey);
    attachedBytes += bytes.byteLength;
    if (attachedBytes > 20 * 1024 * 1024) {
      throw new Error("Attached documents exceed DocuSign's 20 MB envelope limit.");
    }
    envelopeDocuments.push({
      documentId: String(envelopeDocuments.length + 1),
      name: document.name,
      fileExtension: extension,
      documentBase64: bytes.toString("base64"),
    });
  }

  // Sign tab near the bottom of the one-page letter.
  const documentId = "1";
  const envelopeInput: CreateEnvelopeInput = {
    emailSubject: `Offer from ${recipient.companyName ?? "us"} — ${input.offer.title}`,
    status: "sent",
    documents: envelopeDocuments,
    signers: [
      {
        email: recipientEmail,
        name: candidateName,
        recipientId: "1",
        routingOrder: "1",
        // Stable + unpredictable embedded-signer id.
        clientUserId: `harly-${input.offer.candidateId}`,
        tabs: {
          signHereTabs: [
            {
              documentId,
              pageNumber: "1",
              xPosition: "80",
              yPosition: "720",
            },
          ],
        },
      },
    ],
    customFields: {
      textCustomFields: [
        { name: "offerId", value: input.offer.id, required: "false", show: "false" },
        { name: "workspaceId", value: input.workspaceId, required: "false", show: "false" },
        { name: "candidateId", value: input.offer.candidateId, required: "false", show: "false" },
      ],
    },
    eventNotification: {
      url: webhookUrl,
      loggingEnabled: "true",
      requireAcknowledgment: "true",
      includeDocuments: "false",
      includeCertificateOfCompletion: "false",
      includeEnvelopeVoidReason: "true",
      includeTimeZone: "true",
      envelopeEvents: [
        { envelopeEventStatusCode: "sent" },
        { envelopeEventStatusCode: "delivered" },
        { envelopeEventStatusCode: "completed" },
        { envelopeEventStatusCode: "declined" },
        { envelopeEventStatusCode: "voided" },
      ],
      recipientEvents: [
        { recipientEventStatusCode: "Sent" },
        { recipientEventStatusCode: "Delivered" },
        { recipientEventStatusCode: "Completed" },
        { recipientEventStatusCode: "Declined" },
      ],
      eventData: {
        version: "restv2.1",
        format: "json",
        includeData: ["custom_fields", "recipients"],
      },
    },
  };

  const created = await createEnvelope(
    ctx.baseUrl,
    ctx.accessToken,
    ctx.accountId,
    envelopeInput,
  );

  // Persist the envelopeId as the primary correlation key and mark every
  // attached ATS document as pending in the same transaction.
  await db.transaction(async (tx) => {
    const [signatureEnvelope] = await tx
      .insert(signatureEnvelopes)
      .values({
        workspaceId: input.workspaceId,
        provider: "docusign",
        providerEnvelopeId: created.envelopeId,
        kind: "offer",
        status: "sent",
        offerId: input.offer.id,
        subject: envelopeInput.emailSubject,
        createdById: input.offer.createdById,
        sentAt: new Date(),
      })
      .returning({ id: signatureEnvelopes.id });
    if (!signatureEnvelope) {
      throw new Error("Signature envelope could not be saved.");
    }
    await tx.insert(signatureRecipients).values({
      workspaceId: input.workspaceId,
      envelopeId: signatureEnvelope.id,
      providerRecipientId: "1",
      role: "signer",
      email: recipientEmail,
      name: candidateName,
      routingOrder: 1,
      clientUserId: `harly-${input.offer.candidateId}`,
      status: "sent",
    });
    await tx
      .update(offers)
      .set({
        docusignEnvelopeId: created.envelopeId,
        signatureEnvelopeRefId: signatureEnvelope.id,
        updatedAt: new Date(),
      })
      .where(and(eq(offers.workspaceId, input.workspaceId), eq(offers.id, input.offer.id)));
    if (attachedDocuments.length > 0) {
      await tx
        .update(documents)
        .set({ signatureStatus: "pending", signatureProvider: "docusign", signatureEnvelopeId: created.envelopeId, signatureEnvelopeRefId: signatureEnvelope.id, signatureUrl: getDocuSignEnvelopeUrl(ctx.baseUrl, created.envelopeId), updatedAt: new Date() })
        .where(and(eq(documents.workspaceId, input.workspaceId), inArray(documents.id, attachedDocuments.map((document) => document.id))));
      await tx.insert(activityEvents).values(
        attachedDocuments.map((document) => ({
          workspaceId: input.workspaceId,
          actorId: input.offer.createdById,
          entityType: "document" as const,
          entityId: document.id,
          type: "document.signature_changed",
          metadata: { status: "pending", provider: "docusign", envelopeId: created.envelopeId, offerId: input.offer.id },
        })),
      );
    }
  });

  return created.envelopeId;
}
