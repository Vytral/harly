import "server-only";

import { and, eq } from "drizzle-orm";

import { db, offers, type Offer } from "@harly/db";

import {
  createEnvelope,
  freshDocuSignContext,
  type CreateEnvelopeInput,
} from "@/lib/docusign/client";
import { createLogger } from "@/lib/logger";
import { getWorkspaceDocuSignConfig } from "@/lib/docusign/config";
import { getOfferRecipient } from "@/features/offers/core";
import { formatOfferComp } from "@/features/offers/shared";

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
  const config = await getWorkspaceDocuSignConfig(input.workspaceId);
  if (!config || config.offerSignatureChannel !== "docusign") {
    return null;
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

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const webhookUrl = `${appUrl}/api/integrations/docusign/webhook?ws=${input.workspaceId}`;

  // Sign tab near the bottom of the one-page letter.
  const documentId = "1";
  const envelopeInput: CreateEnvelopeInput = {
    emailSubject: `Offer from ${recipient.companyName ?? "us"} — ${input.offer.title}`,
    status: "sent",
    documents: [
      {
        documentId,
        name: "Offer.pdf",
        fileExtension: "html",
        htmlDefinition: {
          source: "embedded",
          documentBase64: Buffer.from(html, "utf8").toString("base64"),
        },
      },
    ],
    signers: [
      {
        email: recipient.email,
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

  // Persist the envelopeId as the primary correlation key.
  await db_updateOfferEnvelope(
    input.workspaceId,
    input.offer.id,
    created.envelopeId,
  );

  return created.envelopeId;
}

/** Persist the DocuSign envelopeId on the offer row (primary correlation key). */
async function db_updateOfferEnvelope(
  workspaceId: string,
  offerId: string,
  envelopeId: string,
): Promise<void> {
  await db
    .update(offers)
    .set({ docusignEnvelopeId: envelopeId, updatedAt: new Date() })
    .where(and(eq(offers.workspaceId, workspaceId), eq(offers.id, offerId)));
}
