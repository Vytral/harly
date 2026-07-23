import "server-only";

import { and, eq } from "drizzle-orm";

import {
  db,
  documentAssociations,
  documents,
  offers,
  signatureEnvelopes,
  signatureRecipients,
  type Offer,
} from "@harly/db";

import {
  createSubmissionFromHtml,
  freshEsignContext,
  type CreateSubmissionFromHtmlInput,
  type DocusealSubmitter,
} from "@/lib/esign/client";
import { createLogger } from "@/lib/logger";
import { getWorkspaceEsignConfig } from "@/lib/esign/config";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { getOfferRecipient } from "@/features/offers/core";
import { formatOfferComp } from "@/features/offers/shared";

const log = createLogger("esign-offer-signing");

/**
 * DocuSeal offer flow: build the offer as an HTML document (no PDF render dep),
 * create a DocuSeal submission with the candidate as an embedded signer
 * (send_email: false — the offer email drives delivery, signing happens in the
 * candidate portal), and wire the completed-redirect back to the portal. The
 * `submission.completed` webhook downloads the signed PDF and attaches it to the
 * candidate. Mirrors the former lib/docusign/offer-document.ts.
 */

/** The submitter role name the signature field tag is bound to. */
export const OFFER_SIGNER_ROLE = "Candidate";
/** The field name for the candidate's signature (referenced by the HTML tag). */
const OFFER_SIGNATURE_FIELD = "Signature";

/** MIME types DocuSeal can sign — used to filter attached-doc conflict checks. */
const SIGNABLE_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
]);

function fmtDate(value: Date | string | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(d);
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
 * Build the offer letter as an HTML string for the DocuSeal submission. A
 * `<signature-field>` tag near the bottom is what DocuSeal renders as the signer
 * ceremony; `role` MUST equal OFFER_SIGNER_ROLE so the submitter is bound to it.
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
    ...(input.salary ? [{ label: "Compensation", value: escapeHtml(input.salary) }] : []),
    ...(input.equity ? [{ label: "Equity", value: escapeHtml(input.equity) }] : []),
    ...(input.startDate ? [{ label: "Start date", value: escapeHtml(input.startDate) }] : []),
    ...(input.expiresAt ? [{ label: "Respond by", value: escapeHtml(input.expiresAt) }] : []),
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

  // DocuSeal signature field tag. `required` + `role` bind it to the candidate
  // submitter; the inline style sizes the signing box.
  const signatureTag = `<signature-field name="${OFFER_SIGNATURE_FIELD}" role="${OFFER_SIGNER_ROLE}" required="true" style="width:280px;height:64px;display:block"></signature-field>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:Inter,Helvetica,Arial,sans-serif;color:#171717;max-width:640px;margin:0 auto;padding:32px}
  h1{font-size:28px;font-weight:600;letter-spacing:-0.5px;margin:0 0 8px}
  .sub{color:#52525b;font-size:14px;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;background:#eaf6c8;border-radius:12px;overflow:hidden;margin:16px 0 24px}
  p{font-size:14px;color:#3f3f46;line-height:1.6}
  .sig{margin-top:48px}
  .label{color:#52525b;font-size:12px;margin-top:6px}
</style></head><body>
  <h1>Offer of employment</h1>
  <div class="sub">${escapeHtml(input.companyName)}</div>
  <p>Dear ${escapeHtml(input.candidateName)},</p>
  <p>We are delighted to offer you the position of <strong>${escapeHtml(input.jobTitle)}</strong> at ${escapeHtml(input.companyName)}. Below are the terms of your offer.</p>
  <table><tbody>${tableRows}</tbody></table>
  ${notesBlock}
  <p>To accept this offer, please sign below. We are excited to have you join the team.</p>
  <div class="sig">
    ${signatureTag}
    <div class="label">Signature</div>
  </div>
</body></html>`;
}

/**
 * Create a DocuSeal submission for an offer and persist the submission id on the
 * offer row. Returns the submission id, or null when e-signature is not
 * configured / not the selected channel (caller falls back to email-only).
 */
export async function createOfferEnvelope(input: {
  workspaceId: string;
  offer: Offer;
}): Promise<string | null> {
  if (input.offer.esignSubmissionId) {
    return input.offer.esignSubmissionId;
  }
  const config = await getWorkspaceEsignConfig(input.workspaceId);
  if (!config || config.offerSignatureChannel !== "esign") {
    return null;
  }

  const ctx = await freshEsignContext(input.workspaceId);
  if (!ctx) {
    log.warn(
      { workspaceId: input.workspaceId, offerId: input.offer.id },
      "createOfferEnvelope: DocuSeal not connected",
    );
    return null;
  }

  const recipient = await getOfferRecipient(input.workspaceId, input.offer.candidateId);
  if (!recipient?.email) {
    log.warn({ offerId: input.offer.id }, "createOfferEnvelope: candidate has no email");
    return null;
  }
  const recipientEmail = recipient.email;
  const candidateName =
    [recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || recipient.email;

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

  // Attached ATS documents ride along in the same submission as extra PDF pages
  // are NOT supported by /submissions/html; the offer letter is the sole doc for
  // the offer flow. Attached documents keep their own signing via the Documents
  // hub. Guard against sending a doc that already has an active envelope.
  const attachedDocuments = await db
    .select({
      id: documents.id,
      mimeType: documents.mimeType,
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
  const signableAttachments = attachedDocuments.filter((d) => SIGNABLE_MIME.has(d.mimeType));
  if (signableAttachments.some((d) => ["signed", "pending"].includes(d.signatureStatus))) {
    throw new Error("One or more attached documents already has an active signature request.");
  }

  const returnUrl = `${getHarlyPublicOrigin()}/portal/applications/${input.offer.applicationId}?signed=pending`;

  const submissionInput: CreateSubmissionFromHtmlInput = {
    name: `Offer — ${input.offer.title}`,
    // The offer email is the delivery mechanism; the candidate signs in-portal.
    send_email: false,
    ...(input.offer.expiresAt
      ? { expire_at: toDocusealDate(input.offer.expiresAt) }
      : {}),
    documents: [{ name: "Offer", html }],
    submitters: [
      {
        role: OFFER_SIGNER_ROLE,
        email: recipientEmail,
        name: candidateName,
        external_id: input.offer.candidateId,
        send_email: false,
        completed_redirect_url: returnUrl,
        metadata: {
          offerId: input.offer.id,
          workspaceId: input.workspaceId,
          candidateId: input.offer.candidateId,
        },
      },
    ],
  };

  const submission = await createSubmissionFromHtml(ctx, submissionInput);
  const submissionId = String(submission.id);
  const signer = pickSigner(submission.submitters, OFFER_SIGNER_ROLE);
  const signingUrl = signerSigningUrl(ctx.baseUrl, signer);

  await db.transaction(async (tx) => {
    const [signatureEnvelope] = await tx
      .insert(signatureEnvelopes)
      .values({
        workspaceId: input.workspaceId,
        provider: "docuseal",
        providerEnvelopeId: submissionId,
        kind: "offer",
        status: "sent",
        offerId: input.offer.id,
        subject: submissionInput.name,
        createdById: input.offer.createdById,
        sentAt: new Date(),
      })
      .returning({ id: signatureEnvelopes.id });
    if (!signatureEnvelope) throw new Error("Signature envelope could not be saved.");

    await tx.insert(signatureRecipients).values({
      workspaceId: input.workspaceId,
      envelopeId: signatureEnvelope.id,
      providerRecipientId: signer ? String(signer.id) : "1",
      role: "signer",
      email: recipientEmail,
      name: candidateName,
      routingOrder: 1,
      clientUserId: input.offer.candidateId,
      signingUrl,
      status: "sent",
    });

    await tx
      .update(offers)
      .set({
        esignSubmissionId: submissionId,
        signatureEnvelopeRefId: signatureEnvelope.id,
        updatedAt: new Date(),
      })
      .where(and(eq(offers.workspaceId, input.workspaceId), eq(offers.id, input.offer.id)));
  });

  return submissionId;
}

/** DocuSeal expects `YYYY-MM-DD HH:mm:ss UTC` for expire_at. */
function toDocusealDate(value: Date): string {
  return `${value.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function pickSigner(
  submitters: DocusealSubmitter[],
  role: string,
): DocusealSubmitter | undefined {
  return (
    submitters.find((s) => s.role?.toLowerCase() === role.toLowerCase()) ??
    submitters[0]
  );
}

export function signerSigningUrl(
  baseUrl: string,
  signer: DocusealSubmitter | undefined,
): string | null {
  if (!signer) return null;
  if (signer.embed_src) return signer.embed_src;
  if (signer.slug) return `${baseUrl}/s/${signer.slug}`;
  return null;
}
