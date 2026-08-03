"use server";

import { revalidatePath } from "next/cache";
import { and, eq, exists, getTableColumns, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  activityEvents,
  applications,
  applicationStageHistory,
  db,
  documentAssociations,
  documents,
  candidates,
  emailOutbox,
  jobs,
  jobHiringTeam,
  jobStages,
  notifications,
  offers,
  signatureFields,
  signatureEnvelopes,
} from "@harly/db";

import {
  requireApplicationPermission,
  requireOfferPermission,
} from "@/features/workspaces/permissions-server";
import { getDocumentAccessForUser } from "@/features/documents/access";
import { createLogger } from "@/lib/logger";
import { emitWebhookEvent } from "@/server/webhooks/emit";
import {
  persistDomainEvent,
  publishPersistedDomainEvents,
} from "@/server/events/emit";
import {
  enqueueEmailOutbox,
  processEmailOutbox,
} from "@/lib/email/outbox-processor";
import {
  archiveDocusealOffer,
  createOfferEnvelope,
} from "@/lib/esign/offer-signing";
import {
  ensureNativeOfferEnvelope,
  getOrCreateNativeOfferDocument,
} from "@/lib/esign/native/offer-signing";
import { isSignableNativeFieldsSnapshot } from "@/lib/esign/native/fields";
import { getWorkspaceEsignStatus } from "@/lib/esign/config";
import {
  assertOfferTerms,
  getOfferRecipient,
  offerHasExpired,
  serializeOfferTermsSnapshot,
  snapshotOfferTerms,
} from "./core";

const log = createLogger("offers");

const offerFieldsSchema = z.object({
  title: z.string().trim().min(1, "Offer title is required.").max(200),
  salaryAmount: z.number().int().positive().max(100_000_000).nullable(),
  currency: z.string().trim().max(8).nullable(),
  salaryPeriod: z.enum(["annual", "monthly"]).nullable(),
  equity: z.string().trim().max(120).nullable(),
  startDate: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  notes: z.string().trim().max(5000).nullable(),
});

const createOfferSchema = offerFieldsSchema.extend({
  applicationId: z.uuid(),
  documentIds: z.array(z.uuid()).max(20).optional().default([]),
});

const updateOfferSchema = offerFieldsSchema.extend({
  offerId: z.uuid(),
});

type ActionResult = { success: boolean; error?: string };

/** Load an offer's application context, workspace-scoped. */
async function getOfferRow(workspaceId: string, offerId: string) {
  const [row] = await db
    .select({
      ...getTableColumns(offers),
      updatedAtVersion: sql<string>`${offers.updatedAt}::text`,
    })
    .from(offers)
    .where(
      and(
        eq(offers.workspaceId, workspaceId),
        eq(offers.id, offerId),
        // Keep the denormalized offer links coherent before any mutation.
        exists(
          db
            .select({ id: applications.id })
            .from(applications)
            .where(
              and(
                eq(applications.workspaceId, workspaceId),
                eq(applications.id, offers.applicationId),
                eq(applications.candidateId, offers.candidateId),
                eq(applications.jobId, offers.jobId),
              ),
            ),
        ),
        exists(
          db
            .select({ id: candidates.id })
            .from(candidates)
            .where(
              and(
                eq(candidates.workspaceId, workspaceId),
                eq(candidates.id, offers.candidateId),
                isNull(candidates.deletedAt),
              ),
            ),
        ),
        exists(
          db
            .select({ id: jobs.id })
            .from(jobs)
            .where(
              and(
                eq(jobs.workspaceId, workspaceId),
                eq(jobs.id, offers.jobId),
                isNull(jobs.deletedAt),
              ),
            ),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function logOfferActivity(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    workspaceId: string;
    actorId: string;
    applicationId: string;
    type: string;
    metadata: Record<string, unknown>;
  },
) {
  await tx.insert(activityEvents).values({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    entityType: "application",
    entityId: input.applicationId,
    type: input.type,
    metadata: input.metadata,
  });
}

/** Notify the job's hiring team (minus the actor) about an offer event. */
async function notifyHiringTeam(input: {
  workspaceId: string;
  actorId: string;
  actorName: string;
  jobId: string;
  candidateId: string;
  candidateName: string;
  type: string;
  title: string;
}) {
  const team = await db
    .select({ userId: jobHiringTeam.userId })
    .from(jobHiringTeam)
    .where(
      and(
        eq(jobHiringTeam.workspaceId, input.workspaceId),
        eq(jobHiringTeam.jobId, input.jobId),
      ),
    );

  const recipients = [...new Set(team.map((m) => m.userId))].filter(
    (id) => id !== input.actorId,
  );
  if (recipients.length === 0) return;

  await db.insert(notifications).values(
    recipients.map((userId) => ({
      workspaceId: input.workspaceId,
      userId,
      actorId: input.actorId,
      type: input.type,
      title: input.title,
      href: `/dashboard/candidates/${input.candidateId}`,
    })),
  );
}

export async function createOffer(input: {
  applicationId: string;
  title: string;
  salaryAmount: number | null;
  currency: string | null;
  salaryPeriod: "annual" | "monthly" | null;
  equity: string | null;
  startDate: string | null;
  expiresAt: string | null;
  notes: string | null;
  documentIds?: string[];
}): Promise<ActionResult> {
  const parsed = createOfferSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid offer.",
    };
  }

  const terms = assertOfferTerms({
    salaryAmount: parsed.data.salaryAmount,
    currency: parsed.data.currency,
    salaryPeriod: parsed.data.salaryPeriod,
    startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  });
  if (!terms.ok) {
    return { success: false, error: terms.message };
  }

  let context;
  try {
    context = await requireApplicationPermission(
      "offers:manage",
      parsed.data.applicationId,
    );
  } catch (error) {
    log.error(error, "createOffer failed");
    return {
      success: false,
      error: "You do not have permission to manage offers.",
    };
  }
  const workspaceId = context.organization.id;

  const [application] = await db
    .select({
      id: applications.id,
      candidateId: applications.candidateId,
      jobId: applications.jobId,
      status: applications.status,
    })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, workspaceId),
        eq(applications.id, parsed.data.applicationId),
      ),
    )
    .limit(1);

  if (!application) {
    return { success: false, error: "Application not found." };
  }
  if (application.status !== "active") {
    return {
      success: false,
      error: "Only active applications can receive an offer.",
    };
  }

  if (parsed.data.documentIds.length > 0) {
    const accessible = await Promise.all(
      parsed.data.documentIds.map((documentId) =>
        getDocumentAccessForUser({
          documentId,
          workspaceId,
          userId: context.user.id,
          roleKey: context.roleKey,
        }),
      ),
    );
    if (accessible.some((document) => !document)) {
      return {
        success: false,
        error: "One or more selected documents are not accessible.",
      };
    }
  }

  await db.transaction(async (tx) => {
    const [lockedApplication] = await tx
      .select({
        id: applications.id,
        candidateId: applications.candidateId,
        jobId: applications.jobId,
        status: applications.status,
      })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, workspaceId),
          eq(applications.id, application.id),
        ),
      )
      .for("update")
      .limit(1);
    if (!lockedApplication || lockedApplication.status !== "active") {
      throw new Error("Only active applications can receive an offer.");
    }

    const [createdOffer] = await tx
      .insert(offers)
      .values({
        workspaceId,
        applicationId: application.id,
        candidateId: lockedApplication.candidateId,
        jobId: lockedApplication.jobId,
        status: "draft",
        title: parsed.data.title,
        salaryAmount: parsed.data.salaryAmount,
        currency: parsed.data.currency,
        salaryPeriod: parsed.data.salaryPeriod,
        equity: parsed.data.equity,
        startDate: parsed.data.startDate
          ? new Date(parsed.data.startDate)
          : null,
        expiresAt: parsed.data.expiresAt
          ? new Date(parsed.data.expiresAt)
          : null,
        notes: parsed.data.notes,
        createdById: context.user.id,
      })
      .returning({ id: offers.id });
    if (createdOffer && parsed.data.documentIds.length > 0) {
      await tx.insert(documentAssociations).values(
        parsed.data.documentIds.map((documentId) => ({
          workspaceId,
          documentId,
          targetType: "offer",
          targetId: createdOffer.id,
          createdById: context.user.id,
        })),
      );
    }

    await logOfferActivity(tx, {
      workspaceId,
      actorId: context.user.id,
      applicationId: lockedApplication.id,
      type: "offer.created",
      metadata: { title: parsed.data.title },
    });
  });

  revalidatePath(`/dashboard/candidates/${application.candidateId}`);
  return { success: true };
}

/** Edit a draft offer's terms. Sent/decided offers are immutable. */
export async function updateOffer(input: {
  offerId: string;
  title: string;
  salaryAmount: number | null;
  currency: string | null;
  salaryPeriod: "annual" | "monthly" | null;
  equity: string | null;
  startDate: string | null;
  expiresAt: string | null;
  notes: string | null;
}): Promise<ActionResult> {
  const parsed = updateOfferSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid offer.",
    };
  }

  const terms = assertOfferTerms({
    salaryAmount: parsed.data.salaryAmount,
    currency: parsed.data.currency,
    salaryPeriod: parsed.data.salaryPeriod,
    startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  });
  if (!terms.ok) {
    return { success: false, error: terms.message };
  }

  let context;
  try {
    context = await requireOfferPermission(
      "offers:manage",
      parsed.data.offerId,
    );
  } catch (error) {
    log.error(error, "updateOffer failed");
    return {
      success: false,
      error: "You do not have permission to manage offers.",
    };
  }
  const workspaceId = context.organization.id;

  const offer = await getOfferRow(workspaceId, parsed.data.offerId);
  if (!offer) return { success: false, error: "Offer not found." };
  if (offer.status !== "draft") {
    return { success: false, error: "Only draft offers can be edited." };
  }

  const [inFlightSend] = await db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.workspaceId, workspaceId),
        eq(emailOutbox.kind, "offer.extended"),
        or(eq(emailOutbox.status, "pending"), eq(emailOutbox.status, "processing")),
        sql`${emailOutbox.payload}->>'offerId' = ${offer.id}`,
      ),
    )
    .limit(1);
  if (inFlightSend) {
    return {
      success: false,
      error: "This offer is being sent. Wait for delivery before editing its terms.",
    };
  }

  const [updated] = await db
    .update(offers)
    .set({
      title: parsed.data.title,
      salaryAmount: parsed.data.salaryAmount,
      currency: parsed.data.currency,
      salaryPeriod: parsed.data.salaryPeriod,
      equity: parsed.data.equity,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      notes: parsed.data.notes,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(offers.workspaceId, workspaceId),
        eq(offers.id, offer.id),
        eq(offers.status, "draft"),
        sql`${offers.updatedAt} = ${offer.updatedAtVersion}::timestamptz`,
      ),
    )
    .returning({ id: offers.id });
  if (!updated) {
    return { success: false, error: "Offer changed while you were editing it. Refresh and try again." };
  }

  revalidatePath(`/dashboard/candidates/${offer.candidateId}`);
  return { success: true };
}

const transitionSchema = z.object({ offerId: z.uuid() });

/** draft → sent. */
export async function sendOffer(input: {
  offerId: string;
}): Promise<ActionResult> {
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid offer." };

  let context;
  try {
    context = await requireOfferPermission(
      "offers:manage",
      parsed.data.offerId,
    );
  } catch (error) {
    log.error(error, "sendOffer failed");
    return {
      success: false,
      error: "You do not have permission to manage offers.",
    };
  }
  const workspaceId = context.organization.id;

  const offer = await getOfferRow(workspaceId, parsed.data.offerId);
  if (!offer) return { success: false, error: "Offer not found." };
  if (offer.status !== "draft") {
    return { success: false, error: "Only draft offers can be sent." };
  }
  if (offerHasExpired(offer.expiresAt)) {
    return {
      success: false,
      error: "This offer has expired and can no longer be sent.",
    };
  }

  const [application] = await db
    .select({ status: applications.status })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, workspaceId),
        eq(applications.id, offer.applicationId),
      ),
    )
    .limit(1);
  if (!application || application.status !== "active") {
    return {
      success: false,
      error: "Only active applications can receive an offer.",
    };
  }

  const recipient = await getOfferRecipient(workspaceId, offer.candidateId);
  if (!recipient?.email) {
    return {
      success: false,
      error: "The candidate does not have an email address.",
    };
  }

  // Offer signing channel: when the workspace opted into e-signature (DocuSeal
  // or native), prepare the signature envelope/document BEFORE the email. The
  // email still notifies the candidate (and points them to the portal to
  // sign); the envelope is the primary correlation key for flipping status.
  const esignStatus = await getWorkspaceEsignStatus(workspaceId);
  if (esignStatus.offerSignatureChannel === "esign") {
    try {
      await createOfferEnvelope({ workspaceId, offer });
    } catch (error) {
      log.error(
        { error, offerId: offer.id },
        "sendOffer: DocuSeal submission creation failed",
      );
      return {
        success: false,
        error:
          "Could not create the signature request. Check the DocuSeal connection and try again.",
      };
    }
  } else if (esignStatus.offerSignatureChannel === "native") {
    try {
      const prepared = await getOrCreateNativeOfferDocument({ workspaceId, offer });
      if (!prepared) {
        return {
          success: false,
          error: "Could not prepare the offer letter for signing.",
        };
      }
      if (!isSignableNativeFieldsSnapshot(prepared.fieldsSnapshot)) {
        return {
          success: false,
          error: "Place at least one required signature field before sending the offer.",
        };
      }
      await ensureNativeOfferEnvelope({
        workspaceId,
        offer,
        documentId: prepared.documentId,
        fieldsSnapshot: prepared.fieldsSnapshot,
      });
    } catch (error) {
      log.error(
        { error, offerId: offer.id },
        "sendOffer: native offer letter creation failed",
      );
      return {
        success: false,
        error: "Could not prepare the offer letter for signing.",
      };
    }
  }

  // A durable outbox row is the single source of truth: the worker sends the
  // email and only then flips the offer to `sent`, so a crash mid-flight can
  // never leave the offer as `sent` without a delivered email (or resend it).
  // enqueueEmailOutbox dedupes by a hash of (kind, payload), so a double send
  // (double-click, retry, AI agent) reuses the same row instead of creating
  // duplicates and double-counting deliveries / offer.sent events.
  const outboxId = await enqueueEmailOutbox(
    workspaceId,
    "offer.extended",
    {
      offerId: offer.id,
      terms: serializeOfferTermsSnapshot(snapshotOfferTerms(offer)),
    },
    undefined,
    context.user.id,
  );

  await processEmailOutbox({ ids: [outboxId] });

  const [updated] = await db
    .select({ status: emailOutbox.status })
    .from(emailOutbox)
    .where(eq(emailOutbox.id, outboxId))
    .limit(1);

  if (updated?.status !== "sent") {
    return {
      success: false,
      error: "Offer delivery failed. It has been queued for retry.",
    };
  }

  revalidatePath(`/dashboard/candidates/${offer.candidateId}`);
  return { success: true };
}

const draftFieldSchema = z.object({
  type: z.enum(["signature", "text"]),
  page: z.number().int().positive(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().positive().max(1),
  h: z.number().positive().max(1),
  label: z.string().trim().max(60).nullable().optional(),
  required: z.boolean().default(true),
  order: z.number().int().min(0).default(0),
});

const saveFieldsAndSendSchema = z.object({
  offerId: z.uuid(),
  fields: z.array(draftFieldSchema).min(1).max(40),
});

/**
 * Recruiter-facing "place fields, then send" — the native e-signature
 * counterpart to a plain `sendOffer`. One atomic step: replace the draft
 * `signatureFields` for the offer letter document, freeze them into
 * `documents.fieldsSnapshot`, THEN call the existing `sendOffer` (which does
 * its own outbox-backed, idempotent delivery). Never split "save fields" and
 * "send" into two separate client-driven calls — that leaves real partial
 * states (fields saved but nothing sent, a double-click duplicating rows).
 *
 * Guarded the same way `sendOffer` already is (`status === "draft"`), plus a
 * `SELECT ... FOR UPDATE` recheck inside the transaction so a concurrent
 * double-click/retry blocks on the lock and then no-ops once it sees the
 * offer already left `draft` — same pattern as the signature-fields backfill
 * script's concurrency fix.
 */
export async function saveOfferSignatureFieldsAndSend(
  input: unknown,
): Promise<ActionResult> {
  const parsed = saveFieldsAndSendSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid field placement." };
  }

  let context;
  try {
    context = await requireOfferPermission("offers:manage", parsed.data.offerId);
  } catch (error) {
    log.error(error, "saveOfferSignatureFieldsAndSend failed");
    return {
      success: false,
      error: "You do not have permission to manage offers.",
    };
  }
  const workspaceId = context.organization.id;

  const offer = await getOfferRow(workspaceId, parsed.data.offerId);
  if (!offer) return { success: false, error: "Offer not found." };
  if (offer.status !== "draft") {
    return { success: false, error: "Only draft offers can be sent." };
  }
  if (offerHasExpired(offer.expiresAt)) {
    return {
      success: false,
      error: "This offer has expired and can no longer be sent.",
    };
  }

  const esignStatus = await getWorkspaceEsignStatus(workspaceId);
  if (esignStatus.offerSignatureChannel !== "native") {
    return {
      success: false,
      error: "Field placement is only available for native e-signature offers.",
    };
  }

  const prepared = await getOrCreateNativeOfferDocument({ workspaceId, offer });
  if (!prepared) {
    return {
      success: false,
      error: "Could not prepare the offer letter for signing.",
    };
  }

  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ status: offers.status })
        .from(offers)
        .where(and(eq(offers.id, offer.id), eq(offers.workspaceId, workspaceId)))
        .for("update")
        .limit(1);
      if (!locked || locked.status !== "draft") {
        throw new Error("This offer is no longer a draft.");
      }

      await tx
        .delete(signatureFields)
        .where(eq(signatureFields.documentId, prepared.documentId));

      const inserted = await tx
        .insert(signatureFields)
        .values(
          parsed.data.fields.map((f) => ({
            workspaceId,
            documentId: prepared.documentId,
            type: f.type,
            page: f.page,
            x: f.x,
            y: f.y,
            w: f.w,
            h: f.h,
            label: f.label ?? null,
            required: f.required,
            order: f.order,
            createdById: context.user.id,
          })),
        )
        .returning();

      const snapshot = inserted.map((f) => ({
        id: f.id,
        type: f.type,
        page: f.page,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        label: f.label,
        required: f.required,
        order: f.order,
      }));

      await tx
        .update(documents)
        .set({ fieldsSnapshot: snapshot })
        .where(
          and(
            eq(documents.id, prepared.documentId),
            eq(documents.workspaceId, workspaceId),
          ),
        );
    });
  } catch (error) {
    log.error(
      { error, offerId: offer.id },
      "saveOfferSignatureFieldsAndSend: failed to save fields",
    );
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not save the field placement.",
    };
  }

  return sendOffer({ offerId: offer.id });
}

/**
 * sent → accepted | declined. Accepting also moves the application to the
 * job's Hired stage (when present) and marks it hired , in one transaction.
 */
export async function decideOffer(input: {
  offerId: string;
  decision: "accepted" | "declined";
}): Promise<ActionResult> {
  const parsed = transitionSchema
    .extend({ decision: z.enum(["accepted", "declined"]) })
    .safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid offer." };

  let context;
  try {
    context = await requireOfferPermission(
      "offers:approve",
      parsed.data.offerId,
    );
  } catch (error) {
    log.error(error, "decideOffer failed");
    return {
      success: false,
      error: "You do not have permission to manage offers.",
    };
  }
  const workspaceId = context.organization.id;

  const offer = await getOfferRow(workspaceId, parsed.data.offerId);
  if (!offer) return { success: false, error: "Offer not found." };
  if (offer.status !== "sent") {
    return { success: false, error: "Only sent offers can be decided." };
  }
  if (offerHasExpired(offer.expiresAt)) {
    return {
      success: false,
      error: "This offer has expired and can no longer be decided.",
    };
  }

  const decision = parsed.data.decision;

  // Guard (accepted only): accepting moves the application to `hired`. Refuse
  // up front if the application is no longer `active` (rejected/withdrawn/hired
  // by another flow) — otherwise we'd silently revive a dead candidacy or
  // overwrite a competing decision. Checked before the tx so we can return a
  // clean ActionResult instead of throwing mid-transaction.
  if (decision === "accepted") {
    const [application] = await db
      .select({ id: applications.id, status: applications.status })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, workspaceId),
          eq(applications.id, offer.applicationId),
        ),
      )
      .limit(1);
    if (!application) {
      return { success: false, error: "Application not found." };
    }
    if (application.status !== "active") {
      return {
        success: false,
        error: "This application is no longer active. Refresh and try again.",
      };
    }
  }

  let persistedEvent: Awaited<ReturnType<typeof persistDomainEvent>> | null = null;
  await db.transaction(async (tx) => {
    const [updatedOffer] = await tx
      .update(offers)
      .set({ status: decision, decidedAt: new Date() })
      .where(
        and(
          eq(offers.workspaceId, workspaceId),
          eq(offers.id, offer.id),
          eq(offers.status, "sent"),
        ),
      )
      .returning({ id: offers.id });

    if (!updatedOffer) {
      throw new Error(
        "Offer changed by another recruiter. Refresh and try again.",
      );
    }

    if (decision === "accepted") {
      const [application] = await tx
        .select({
          id: applications.id,
          currentStageId: applications.currentStageId,
          status: applications.status,
        })
        .from(applications)
        .where(
          and(
            eq(applications.workspaceId, workspaceId),
            eq(applications.id, offer.applicationId),
          ),
        )
        .for("update")
        .limit(1);

      if (application) {
        if (application.status !== "active") {
          throw new Error(
            "Application changed by another recruiter. Refresh and try again.",
          );
        }
        const [hiredStage] = await tx
          .select({ id: jobStages.id })
          .from(jobStages)
          .where(
            and(
              eq(jobStages.workspaceId, workspaceId),
              eq(jobStages.jobId, offer.jobId),
              eq(jobStages.name, "Hired"),
            ),
          )
          .limit(1);

        const [hired] = await tx
          .update(applications)
          .set({
            status: "hired",
            ...(hiredStage ? { currentStageId: hiredStage.id } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(applications.workspaceId, workspaceId),
              eq(applications.id, application.id),
              eq(applications.status, "active"),
            ),
          )
          .returning({ id: applications.id });
        if (!hired) {
          throw new Error(
            "Application changed while the offer was being accepted. Refresh and try again.",
          );
        }

        if (hiredStage && hiredStage.id !== application.currentStageId) {
          await tx.insert(applicationStageHistory).values({
            workspaceId,
            applicationId: application.id,
            fromStageId: application.currentStageId,
            toStageId: hiredStage.id,
            movedById: context.user.id,
          });
        }

        await tx.insert(activityEvents).values({
          workspaceId,
          actorId: context.user.id,
          entityType: "application",
          entityId: application.id,
          type: "application.hired",
          metadata: { via: "offer", offerId: offer.id },
        });
      } else {
        throw new Error("Application not found. Refresh and try again.");
      }
    }

    // Audit log inside the tx so it's atomic with the decision mutation.
    await logOfferActivity(tx, {
      workspaceId,
      actorId: context.user.id,
      applicationId: offer.applicationId,
      type: decision === "accepted" ? "offer.accepted" : "offer.declined",
      metadata: { title: offer.title },
    });
    if (decision !== "accepted") return;
    persistedEvent = await persistDomainEvent(tx, {
      name: "application.hired",
      workspaceId,
      actorId: context.user.id,
      aggregateType: "application",
      aggregateId: offer.applicationId,
      payload: {
        application: { id: offer.applicationId, jobId: offer.jobId },
        candidate: { id: offer.candidateId },
        offer: { id: offer.id, title: offer.title },
      },
    });
  });

  if (persistedEvent) {
    await publishPersistedDomainEvents([persistedEvent]);
    await emitWebhookEvent(workspaceId, "application.hired", {
      application: { id: offer.applicationId, jobId: offer.jobId },
      candidate: { id: offer.candidateId },
      offer: { id: offer.id, title: offer.title },
    }, { actorId: context.user.id, skipDomainEvent: true });
  }

  const decisionRecipient = await getOfferRecipient(
    workspaceId,
    offer.candidateId,
  );
  await notifyHiringTeam({
    workspaceId,
    actorId: context.user.id,
    actorName: context.user.name,
    jobId: offer.jobId,
    candidateId: offer.candidateId,
    candidateName: decisionRecipient?.firstName ?? "Candidate",
    type: decision === "accepted" ? "offer.accepted" : "offer.declined",
    title: `Offer ${decision}, ${offer.title}`,
  });

  revalidatePath(`/dashboard/candidates/${offer.candidateId}`);
  revalidatePath("/dashboard/pipeline");
  return { success: true };
}

/** draft|sent → withdrawn. */
export async function withdrawOffer(input: {
  offerId: string;
}): Promise<ActionResult> {
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid offer." };

  let context;
  try {
    context = await requireOfferPermission(
      "offers:manage",
      parsed.data.offerId,
    );
  } catch (error) {
    log.error(error, "withdrawOffer failed");
    return {
      success: false,
      error: "You do not have permission to manage offers.",
    };
  }
  const workspaceId = context.organization.id;

  const offer = await getOfferRow(workspaceId, parsed.data.offerId);
  if (!offer) return { success: false, error: "Offer not found." };
  if (offer.status !== "draft" && offer.status !== "sent") {
    return { success: false, error: "This offer can no longer be withdrawn." };
  }

  await db.transaction(async (tx) => {
    const [lockedOffer] = await tx
      .select({
        status: offers.status,
        esignSubmissionId: offers.esignSubmissionId,
        signatureEnvelopeRefId: offers.signatureEnvelopeRefId,
      })
      .from(offers)
      .where(
        and(
          eq(offers.workspaceId, workspaceId),
          eq(offers.id, offer.id),
        ),
      )
      .for("update")
      .limit(1);
    if (!lockedOffer || (lockedOffer.status !== "draft" && lockedOffer.status !== "sent")) {
      throw new Error("This offer can no longer be withdrawn.");
    }

    if (lockedOffer.status === "sent") {
      const archived = await archiveDocusealOffer({
        workspaceId,
        esignSubmissionId: lockedOffer.esignSubmissionId,
      });
      if (!archived) {
        throw new Error(
          "The signature request could not be revoked. The offer remains active.",
        );
      }
    }

    const [updatedOffer] = await tx
      .update(offers)
      .set({ status: "withdrawn", decidedAt: new Date() })
      .where(
        and(
          eq(offers.workspaceId, workspaceId),
          eq(offers.id, offer.id),
          or(eq(offers.status, "draft"), eq(offers.status, "sent")),
        ),
      )
      .returning({ id: offers.id });

    if (!updatedOffer) {
      throw new Error(
        "Offer changed by another recruiter. Refresh and try again.",
      );
    }

    if (lockedOffer.signatureEnvelopeRefId) {
      await tx
        .update(signatureEnvelopes)
        .set({
          status: "voided",
          voidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(signatureEnvelopes.workspaceId, workspaceId),
            eq(signatureEnvelopes.id, lockedOffer.signatureEnvelopeRefId),
          ),
        );
    }

    await logOfferActivity(tx, {
      workspaceId,
      actorId: context.user.id,
      applicationId: offer.applicationId,
      type: "offer.withdrawn",
      metadata: { title: offer.title },
    });
  });

  // Only notify the candidate if they had actually received the offer.
  if (offer.status === "sent") {
    const recipient = await getOfferRecipient(workspaceId, offer.candidateId);
    if (recipient?.email) {
      const outboxId = await enqueueEmailOutbox(
        workspaceId,
        "offer.withdrawn",
        {
          candidateEmail: recipient.email,
          candidateName: recipient.firstName,
          companyName: recipient.companyName,
          jobTitle: offer.title,
        },
        undefined,
        context.user.id,
      );
      await processEmailOutbox({ ids: [outboxId], workspaceId });
    }
  }

  revalidatePath(`/dashboard/candidates/${offer.candidateId}`);
  return { success: true };
}
