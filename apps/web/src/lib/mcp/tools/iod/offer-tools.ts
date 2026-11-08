import "server-only";

import { and, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";

import { db, documents, offers } from "@harly/db";

import {
  createOffer,
  decideOffer,
  saveOfferSignatureFieldsAndSend,
  sendOffer,
  updateOffer,
  withdrawOffer,
} from "@/features/offers/actions";
import { getWorkspaceEsignStatus } from "@/lib/esign/config";
import { getOrCreateNativeOfferDocument } from "@/lib/esign/native/offer-signing";
import { storage } from "@/lib/storage";
import { defineMcpTool, McpToolError } from "../../types";
import { assertSuccess } from "./common";
import { clampLimit, defaultSignatureFields, paginate, serializeOfferRow } from "./format";
import { queryOfferSignature, queryOffers } from "./queries";

const isoDateTime = (what: string) => z.iso.datetime().nullable().describe(`${what} as an ISO 8601 UTC timestamp (2026-12-01T00:00:00Z), or null.`);

const termsShape = {
  title: z.string().trim().min(1).max(200).describe("Offered role title shown on the offer."),
  salaryAmount: z.number().int().positive().max(100_000_000).nullable().describe("Whole-number salary, or null. Requires currency and salaryPeriod."),
  currency: z.string().trim().max(8).nullable().describe("ISO currency code such as EUR or USD, or null."),
  salaryPeriod: z.enum(["annual", "monthly"]).nullable().describe("Salary period, or null."),
  equity: z.string().trim().max(120).nullable().describe("Free-text equity, e.g. '0.1% over 4 years', or null."),
  startDate: isoDateTime("Proposed start date"),
  expiresAt: isoDateTime("Date the offer expires"),
  notes: z.string().trim().max(5000).nullable().describe("Notes included with the offer, or null."),
};

const opt = <T extends z.ZodType>(field: T) => field.optional().describe(field.description ?? "");

const placedField = z.object({
  type: z.enum(["signature", "text"]).describe("Field kind."),
  page: z.number().int().positive().describe("1-based page number of the offer letter."),
  x: z.number().min(0).max(1).describe("Left edge as a fraction of page width."),
  y: z.number().min(0).max(1).describe("Top edge as a fraction of page height."),
  w: z.number().positive().max(1).describe("Width as a fraction of page width."),
  h: z.number().positive().max(1).describe("Height as a fraction of page height."),
  label: z.string().trim().max(60).nullable().optional().describe("Optional label."),
  required: z.boolean().default(true).describe("Whether the candidate must fill it."),
  order: z.number().int().min(0).default(0).describe("Fill order."),
});

async function requireOfferVisible(offerId: string) {
  const [offer] = await queryOffers({ offerId, limit: 1, offset: 0 });
  if (!offer) throw new McpToolError("Offer not found.", "not_found");
  return offer;
}

/** Place one signature box on the last page of the generated offer letter. */
async function autoPlaceOfferFields(offerId: string, workspaceId: string) {
  const [offer] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.workspaceId, workspaceId), eq(offers.id, offerId)))
    .limit(1);
  if (!offer) throw new McpToolError("Offer not found.", "not_found");
  const prepared = await getOrCreateNativeOfferDocument({ workspaceId, offer });
  if (!prepared) throw new McpToolError("Could not prepare the offer letter for signing.", "unavailable");
  const [doc] = await db
    .select({ storageKey: documents.storageKey })
    .from(documents)
    .where(and(eq(documents.id, prepared.documentId), eq(documents.workspaceId, workspaceId)))
    .limit(1);
  if (!doc) throw new McpToolError("Offer letter document not found.", "not_found");
  const pdf = await PDFDocument.load(await storage.read(doc.storageKey), { ignoreEncryption: true });
  return defaultSignatureFields(pdf.getPageCount(), 1).map((field) => ({
    type: "signature" as const,
    page: field.page,
    x: field.x,
    y: field.y,
    w: field.w,
    h: field.h,
    label: field.label,
    required: field.required,
    order: field.order,
  }));
}

export const offerTools = [
  defineMcpTool({
    name: "offers_list",
    title: "List offers",
    description:
      "List job offers (only jobs the user can access), newest first. Filter by status (draft, sent, accepted, declined, withdrawn), candidate, job or application. Returns terms, status, candidate, job and a deep link. Use offers_get for e-signature progress.",
    group: "offers",
    scope: "offers:read",
    permission: "offers:manage",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    input: z.object({
      status: z.enum(["draft", "sent", "accepted", "declined", "withdrawn"]).optional().describe("Only offers in this status."),
      candidateId: z.string().optional().describe("Only this candidate's offers (candidates_search)."),
      jobId: z.string().optional().describe("Only offers for this job (jobs_list)."),
      applicationId: z.string().optional().describe("Only offers for this application."),
      limit: z.number().int().min(1).max(100).default(25).describe("Max rows (default 25, max 100)."),
      offset: z.number().int().min(0).default(0).describe("Rows to skip, from pagination.nextOffset."),
    }),
    async run(input, ctx) {
      const limit = clampLimit(input.limit);
      const rows = await queryOffers({ ...input, limit, offset: input.offset });
      const page = paginate(rows, limit, input.offset);
      return { offers: page.items.map((row) => serializeOfferRow(row, ctx.appOrigin)), pagination: page.pagination };
    },
  }),

  defineMcpTool({
    name: "offers_get",
    title: "Get offer",
    description:
      "One offer with its terms, status and, when it was sent for e-signature, the signature envelope status and per-signer progress. Also reports the workspace's offer signature channel (email, esign = DocuSeal, native). Get offerId from offers_list.",
    group: "offers",
    scope: "offers:read",
    permission: "offers:manage",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    input: z.object({ offerId: z.string().min(1).describe("Offer id from offers_list.") }),
    async run(input, ctx) {
      const offer = await requireOfferVisible(input.offerId);
      const [signature, esign] = await Promise.all([
        queryOfferSignature(offer.id, ctx.workspaceId),
        getWorkspaceEsignStatus(ctx.workspaceId),
      ]);
      return {
        ...serializeOfferRow(offer, ctx.appOrigin),
        signatureChannel: esign.offerSignatureChannel,
        signature,
      };
    },
  }),

  defineMcpTool({
    name: "offers_create",
    title: "Create offer draft",
    description:
      "Create a draft offer for an active application. Nothing is sent to the candidate; use offers_send afterwards. Only one draft or sent offer can exist per application. salaryAmount needs currency and salaryPeriod. documentIds attaches existing Documents-hub files (documents_list). Returns the new offerId. Harly has no separate approval step: whoever holds offers:manage can send, and recording the candidate's answer needs offers:approve (offers_record_decision).",
    group: "offers",
    scope: "offers:write",
    permission: "offers:manage",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    input: z.object({
      applicationId: z.string().min(1).describe("Application to make the offer on (candidates_get). Must be active."),
      ...termsShape,
      documentIds: z.array(z.string().uuid()).max(20).default([]).describe("Documents-hub document ids to attach."),
    }),
    async run(input) {
      const res = assertSuccess(await createOffer(input), "Offer could not be created.");
      return { offerId: res.offerId ?? null, status: "draft", applicationId: input.applicationId };
    },
  }),

  defineMcpTool({
    name: "offers_update",
    title: "Edit offer draft",
    description:
      "Change the terms of a DRAFT offer. Only the fields you pass change; the rest keep their current value (null clears). Sent, accepted, declined or withdrawn offers cannot be edited: withdraw and create a new one.",
    group: "offers",
    scope: "offers:write",
    permission: "offers:manage",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    input: z.object({
      offerId: z.string().uuid().describe("Offer id from offers_list (status draft)."),
      title: opt(termsShape.title),
      salaryAmount: opt(termsShape.salaryAmount),
      currency: opt(termsShape.currency),
      salaryPeriod: opt(termsShape.salaryPeriod),
      equity: opt(termsShape.equity),
      startDate: opt(termsShape.startDate),
      expiresAt: opt(termsShape.expiresAt),
      notes: opt(termsShape.notes),
    }),
    async run(input) {
      const current = await requireOfferVisible(input.offerId);
      assertSuccess(
        await updateOffer({
          offerId: input.offerId,
          title: input.title ?? current.title,
          salaryAmount: input.salaryAmount !== undefined ? input.salaryAmount : current.salaryAmount,
          currency: input.currency !== undefined ? input.currency : current.currency,
          salaryPeriod: input.salaryPeriod !== undefined ? input.salaryPeriod : (current.salaryPeriod as "annual" | "monthly" | null),
          equity: input.equity !== undefined ? input.equity : current.equity,
          startDate: input.startDate !== undefined ? input.startDate : (current.startDate?.toISOString() ?? null),
          expiresAt: input.expiresAt !== undefined ? input.expiresAt : (current.expiresAt?.toISOString() ?? null),
          notes: input.notes !== undefined ? input.notes : current.notes,
        }),
        "Offer could not be updated.",
      );
      return { updated: true, offerId: input.offerId };
    },
  }),

  defineMcpTool({
    name: "offers_send",
    title: "Send offer to candidate",
    description:
      "Send a draft offer to the candidate. Emails the candidate (and, depending on the workspace signature channel, creates a DocuSeal request or a native e-signature offer letter they sign in the portal), then marks the offer sent. With the native channel the letter needs a signature box: pass signatureFields with exact placement, or autoPlaceSignature=true to put one at the bottom of the last page. Fails if the offer is not a draft, expired, or the candidate has no email. This contacts the candidate and cannot be recalled except by offers_withdraw: confirm with the user first.",
    group: "offers",
    scope: "offers:write",
    permission: "offers:manage",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    input: z.object({
      offerId: z.string().uuid().describe("Draft offer id from offers_list."),
      autoPlaceSignature: z.boolean().default(false).describe("Native e-signature channel only: add one required signature field on the last page of the letter."),
      signatureFields: z.array(placedField).min(1).max(40).optional().describe("Native e-signature channel only: exact field placement on the offer letter."),
    }),
    async run(input, ctx) {
      await requireOfferVisible(input.offerId);
      let fields = input.signatureFields;
      if (!fields && input.autoPlaceSignature) {
        const esign = await getWorkspaceEsignStatus(ctx.workspaceId);
        if (esign.offerSignatureChannel === "native") fields = await autoPlaceOfferFields(input.offerId, ctx.workspaceId);
      }
      const res = fields
        ? await saveOfferSignatureFieldsAndSend({ offerId: input.offerId, fields })
        : await sendOffer({ offerId: input.offerId });
      assertSuccess(res, "Offer could not be sent.");
      return { sent: true, offerId: input.offerId };
    },
  }),

  defineMcpTool({
    name: "offers_record_decision",
    title: "Record offer decision",
    description:
      "Record the candidate's answer to a SENT offer: accepted or declined. Requires the offers:decide permission. Accepting moves the application to the job's Hired stage, marks it hired and withdraws the candidate's other applications as the app does; declining just closes the offer. Use only when the candidate has actually answered (outside the portal e-signature).",
    group: "offers",
    scope: "offers:write",
    permission: "offers:decide",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    input: z.object({
      offerId: z.string().uuid().describe("Sent offer id from offers_list."),
      decision: z.enum(["accepted", "declined"]).describe("The candidate's answer."),
    }),
    async run(input) {
      await requireOfferVisible(input.offerId);
      assertSuccess(await decideOffer(input), "Decision could not be recorded.");
      return { offerId: input.offerId, status: input.decision };
    },
  }),

  defineMcpTool({
    name: "offers_withdraw",
    title: "Withdraw offer",
    description:
      "Withdraw a draft or sent offer. A sent offer is revoked (its signature request is voided) and the candidate is emailed a withdrawal notice. Cannot be undone; create a new offer instead. Not possible once accepted or declined.",
    group: "offers",
    scope: "offers:write",
    permission: "offers:decide",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    input: z.object({ offerId: z.string().uuid().describe("Offer id from offers_list (draft or sent).") }),
    async run(input) {
      await requireOfferVisible(input.offerId);
      assertSuccess(await withdrawOffer(input), "Offer could not be withdrawn.");
      return { offerId: input.offerId, status: "withdrawn" };
    },
  }),
];
