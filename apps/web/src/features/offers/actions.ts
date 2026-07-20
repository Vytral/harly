"use server";

import { revalidatePath } from "next/cache";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";

import {
  activityEvents,
  applications,
  applicationStageHistory,
  db,
  emailOutbox,
  jobHiringTeam,
  jobStages,
  notifications,
  offers,
} from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";
import { emitWebhookEvent } from "@/server/webhooks/emit";
import {
  enqueueEmailOutbox,
  processEmailOutbox,
} from "@/lib/email/outbox-processor";
import {
  assertOfferTerms,
  getOfferRecipient,
  offerHasExpired,
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
});

const updateOfferSchema = offerFieldsSchema.extend({
  offerId: z.uuid(),
});

type ActionResult = { success: boolean; error?: string };

/** Load an offer's application context, workspace-scoped. */
async function getOfferRow(workspaceId: string, offerId: string) {
  const [row] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.workspaceId, workspaceId), eq(offers.id, offerId)))
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
    context = await requirePermission("offers:manage");
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

  await db.transaction(async (tx) => {
    await tx.insert(offers).values({
      workspaceId,
      applicationId: application.id,
      candidateId: application.candidateId,
      jobId: application.jobId,
      status: "draft",
      title: parsed.data.title,
      salaryAmount: parsed.data.salaryAmount,
      currency: parsed.data.currency,
      salaryPeriod: parsed.data.salaryPeriod,
      equity: parsed.data.equity,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      notes: parsed.data.notes,
      createdById: context.user.id,
    });

    await logOfferActivity(tx, {
      workspaceId,
      actorId: context.user.id,
      applicationId: application.id,
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
    context = await requirePermission("offers:manage");
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

  await db
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
    })
    .where(and(eq(offers.workspaceId, workspaceId), eq(offers.id, offer.id)));

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
    context = await requirePermission("offers:manage");
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

  const recipient = await getOfferRecipient(workspaceId, offer.candidateId);
  if (!recipient?.email) {
    return {
      success: false,
      error: "The candidate does not have an email address.",
    };
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
    { offerId: offer.id, actorId: context.user.id },
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
    context = await requirePermission("offers:manage");
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
        })
        .from(applications)
        .where(
          and(
            eq(applications.workspaceId, workspaceId),
            eq(applications.id, offer.applicationId),
          ),
        )
        .limit(1);

      if (application) {
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

        await tx
          .update(applications)
          .set({
            status: "hired",
            ...(hiredStage ? { currentStageId: hiredStage.id } : {}),
          })
          .where(
            and(
              eq(applications.workspaceId, workspaceId),
              eq(applications.id, application.id),
            ),
          );

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
  });

  if (decision === "accepted") {
    await emitWebhookEvent(workspaceId, "application.hired", {
      application: { id: offer.applicationId, jobId: offer.jobId },
      candidate: { id: offer.candidateId },
      offer: { id: offer.id, title: offer.title },
    });
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
    context = await requirePermission("offers:manage");
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
      );
      await processEmailOutbox({ ids: [outboxId], workspaceId });
    }
  }

  revalidatePath(`/dashboard/candidates/${offer.candidateId}`);
  return { success: true };
}
