"use server";

import { revalidatePath } from "next/cache";
import { createElement } from "react";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  activityEvents,
  applications,
  applicationStageHistory,
  candidates,
  db,
  jobHiringTeam,
  jobStages,
  notifications,
  offers,
  organization,
} from "@harly/db";
import {
  OfferExtended,
  offerExtendedSubject,
  OfferWithdrawn,
  offerWithdrawnSubject,
} from "@harly/emails";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { sendWorkspaceEmail } from "@/lib/email";
import { getWorkspaceEmailBranding } from "@/lib/email/branding";
import { createLogger } from "@/lib/logger";
import { emitWebhookEvent } from "@/server/webhooks/emit";

const dateFormatter = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function formatOfferDate(value: Date | null): string | undefined {
  return value ? dateFormatter.format(value) : undefined;
}

/** Human-readable compensation line, e.g. "$120,000 / year". */
function formatOfferSalary(
  amount: number | null,
  currency: string | null,
  period: "annual" | "monthly" | null,
): string | undefined {
  if (!amount) return undefined;
  let money: string;
  try {
    money = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    money = `${amount.toLocaleString()} ${currency ?? ""}`.trim();
  }
  return period === "monthly" ? `${money} / month` : `${money} / year`;
}

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

async function logOfferActivity(input: {
  workspaceId: string;
  actorId: string;
  applicationId: string;
  type: string;
  metadata: Record<string, unknown>;
}) {
  await db.insert(activityEvents).values({
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

  let context;
  try {
    context = await requirePermission("offers:manage");
  } catch (error) {
    log.error(error, "createOffer failed");
    return { success: false, error: "You do not have permission to manage offers." };
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

  await db.insert(offers).values({
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

  await logOfferActivity({
    workspaceId,
    actorId: context.user.id,
    applicationId: application.id,
    type: "offer.created",
    metadata: { title: parsed.data.title },
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

  let context;
  try {
    context = await requirePermission("offers:manage");
  } catch (error) {
    log.error(error, "updateOffer failed");
    return { success: false, error: "You do not have permission to manage offers." };
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
export async function sendOffer(input: { offerId: string }): Promise<ActionResult> {
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid offer." };

  let context;
  try {
    context = await requirePermission("offers:manage");
  } catch (error) {
    log.error(error, "updateOffer failed");
    return { success: false, error: "You do not have permission to manage offers." };
  }
  const workspaceId = context.organization.id;

  const offer = await getOfferRow(workspaceId, parsed.data.offerId);
  if (!offer) return { success: false, error: "Offer not found." };
  if (offer.status !== "draft") {
    return { success: false, error: "Only draft offers can be sent." };
  }

  await db
    .update(offers)
    .set({ status: "sent" })
    .where(and(eq(offers.workspaceId, workspaceId), eq(offers.id, offer.id)));

  await logOfferActivity({
    workspaceId,
    actorId: context.user.id,
    applicationId: offer.applicationId,
    type: "offer.sent",
    metadata: { title: offer.title, salaryAmount: offer.salaryAmount },
  });

  // Email the candidate their offer. Fire-and-forget so a mail hiccup never
  // blocks the state change — matches the apply / stage-change flows.
  const recipient = await getOfferRecipient(workspaceId, offer.candidateId);

  if (recipient?.email) {
    const branding = await getWorkspaceEmailBranding(workspaceId);
    void sendWorkspaceEmail(workspaceId, {
      to: recipient.email,
      subject: offerExtendedSubject({
        companyName: recipient.companyName,
        jobTitle: offer.title,
      }),
      react: createElement(OfferExtended, {
        candidateName: recipient.firstName,
        companyName: recipient.companyName,
        companyLogoUrl: branding.logoUrl ?? undefined,
        accentColor: branding.primaryColor ?? undefined,
        socialLinks: branding.socialLinks,
        jobTitle: offer.title,
        salary: formatOfferSalary(offer.salaryAmount, offer.currency, offer.salaryPeriod),
        startDate: formatOfferDate(offer.startDate),
        expiresAt: formatOfferDate(offer.expiresAt),
        equity: offer.equity ?? undefined,
      }),
    });
  }

  revalidatePath(`/dashboard/candidates/${offer.candidateId}`);
  return { success: true };
}

/**
 * sent → accepted | declined. Accepting also moves the application to the
 * job's Hired stage (when present) and marks it hired — in one transaction.
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
    log.error(error, "updateOffer failed");
    return { success: false, error: "You do not have permission to manage offers." };
  }
  const workspaceId = context.organization.id;

  const offer = await getOfferRow(workspaceId, parsed.data.offerId);
  if (!offer) return { success: false, error: "Offer not found." };
  if (offer.status !== "sent") {
    return { success: false, error: "Only sent offers can be decided." };
  }

  const decision = parsed.data.decision;

  await db.transaction(async (tx) => {
    await tx
      .update(offers)
      .set({ status: decision, decidedAt: new Date() })
      .where(and(eq(offers.workspaceId, workspaceId), eq(offers.id, offer.id)));

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
  });

  if (decision === "accepted") {
    await emitWebhookEvent(workspaceId, "application.hired", {
      application: { id: offer.applicationId, jobId: offer.jobId },
      candidate: { id: offer.candidateId },
      offer: { id: offer.id, title: offer.title },
    });
  }

  await logOfferActivity({
    workspaceId,
    actorId: context.user.id,
    applicationId: offer.applicationId,
    type: decision === "accepted" ? "offer.accepted" : "offer.declined",
    metadata: { title: offer.title },
  });

  const decisionRecipient = await getOfferRecipient(workspaceId, offer.candidateId);
  await notifyHiringTeam({
    workspaceId,
    actorId: context.user.id,
    actorName: context.user.name,
    jobId: offer.jobId,
    candidateId: offer.candidateId,
    candidateName: decisionRecipient?.firstName ?? "Candidate",
    type: decision === "accepted" ? "offer.accepted" : "offer.declined",
    title: `Offer ${decision} — ${offer.title}`,
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
    log.error(error, "updateOffer failed");
    return { success: false, error: "You do not have permission to manage offers." };
  }
  const workspaceId = context.organization.id;

  const offer = await getOfferRow(workspaceId, parsed.data.offerId);
  if (!offer) return { success: false, error: "Offer not found." };
  if (offer.status !== "draft" && offer.status !== "sent") {
    return { success: false, error: "This offer can no longer be withdrawn." };
  }

  await db
    .update(offers)
    .set({ status: "withdrawn", decidedAt: new Date() })
    .where(and(eq(offers.workspaceId, workspaceId), eq(offers.id, offer.id)));

  await logOfferActivity({
    workspaceId,
    actorId: context.user.id,
    applicationId: offer.applicationId,
    type: "offer.withdrawn",
    metadata: { title: offer.title },
  });

  // Only notify the candidate if they had actually received the offer.
  if (offer.status === "sent") {
    const recipient = await getOfferRecipient(workspaceId, offer.candidateId);
    if (recipient?.email) {
      const branding = await getWorkspaceEmailBranding(workspaceId);
      void sendWorkspaceEmail(workspaceId, {
        to: recipient.email,
        subject: offerWithdrawnSubject({ companyName: recipient.companyName, jobTitle: offer.title }),
        react: createElement(OfferWithdrawn, {
          candidateName: recipient.firstName,
          companyName: recipient.companyName,
          companyLogoUrl: branding.logoUrl ?? undefined,
          accentColor: branding.primaryColor ?? undefined,
          socialLinks: branding.socialLinks,
          jobTitle: offer.title,
        }),
      });
    }
  }

  revalidatePath(`/dashboard/candidates/${offer.candidateId}`);
  return { success: true };
}

/** Candidate contact + company name for offer emails, workspace-scoped. */
async function getOfferRecipient(workspaceId: string, candidateId: string) {
  const [row] = await db
    .select({
      email: candidates.email,
      firstName: candidates.firstName,
      companyName: organization.name,
    })
    .from(candidates)
    .innerJoin(organization, eq(organization.id, candidates.workspaceId))
    .where(
      and(
        eq(candidates.id, candidateId),
        eq(candidates.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}
