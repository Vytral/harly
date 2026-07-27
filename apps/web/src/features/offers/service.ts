import "server-only";

import { and, desc, eq, lt, or } from "drizzle-orm";

import { ApiError, type Cursor } from "@harly/api";
import {
  activityEvents,
  applications,
  applicationStageHistory,
  candidates,
  db,
  emailOutbox,
  jobStages,
  offers,
  type Offer,
} from "@harly/db";
// NOTE: `organization` no longer imported directly — `getOfferRecipient` in
// ./core owns the candidates ⨝ organization join so both layers share it.

import {
  enqueueEmailOutbox,
  processEmailOutbox,
} from "@/lib/email/outbox-processor";
import { emitWebhookEvent } from "@/server/webhooks/emit";
import {
  persistDomainEvent,
  publishPersistedDomainEvents,
} from "@/server/events/emit";
import {
  assertOfferTerms,
  getOfferRecipient,
  offerHasExpired,
  type OfferTerms,
} from "./core";

/** Workspace-scoped offer service for REST API. Never reads session state. */

export type OfferApiInput = {
  title: string;
  salaryAmount: number | null;
  currency: string | null;
  salaryPeriod: "annual" | "monthly" | null;
  equity: string | null;
  startDate: Date | null;
  expiresAt: Date | null;
  notes: string | null;
};

export function serializeOffer(offer: Offer) {
  return {
    id: offer.id,
    applicationId: offer.applicationId,
    candidateId: offer.candidateId,
    jobId: offer.jobId,
    status: offer.status,
    title: offer.title,
    salaryAmount: offer.salaryAmount,
    currency: offer.currency,
    salaryPeriod: offer.salaryPeriod,
    equity: offer.equity,
    startDate: offer.startDate?.toISOString() ?? null,
    expiresAt: offer.expiresAt?.toISOString() ?? null,
    notes: offer.notes,
    createdById: offer.createdById,
    decidedAt: offer.decidedAt?.toISOString() ?? null,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  };
}

function cursorWhere(cursor: Cursor | null) {
  if (!cursor) return undefined;
  const createdAt = new Date(cursor.createdAt);
  return or(
    lt(offers.createdAt, createdAt),
    and(eq(offers.createdAt, createdAt), lt(offers.id, cursor.id)),
  );
}

function assertOfferTermsOrThrow(values: OfferTerms) {
  const result = assertOfferTerms(values);
  if (!result.ok) throw ApiError.unprocessable(result.message);
}

export async function listOffersForApi(input: {
  workspaceId: string;
  candidateId?: string;
  applicationId?: string;
  status?: Offer["status"];
  cursor: Cursor | null;
  limit: number;
}): Promise<Offer[]> {
  return db
    .select()
    .from(offers)
    .where(
      and(
        eq(offers.workspaceId, input.workspaceId),
        input.candidateId
          ? eq(offers.candidateId, input.candidateId)
          : undefined,
        input.applicationId
          ? eq(offers.applicationId, input.applicationId)
          : undefined,
        input.status ? eq(offers.status, input.status) : undefined,
        cursorWhere(input.cursor),
      ),
    )
    .orderBy(desc(offers.createdAt), desc(offers.id))
    .limit(input.limit + 1);
}

export async function getOfferForApi(input: {
  workspaceId: string;
  offerId: string;
}): Promise<Offer> {
  const [offer] = await db
    .select()
    .from(offers)
    .where(
      and(
        eq(offers.workspaceId, input.workspaceId),
        eq(offers.id, input.offerId),
      ),
    )
    .limit(1);
  if (!offer) throw ApiError.notFound("Offer not found.");
  return offer;
}

export async function createOfferForApi(input: {
  workspaceId: string;
  actorUserId: string;
  applicationId: string;
  values: OfferApiInput;
}): Promise<Offer> {
  assertOfferTermsOrThrow(input.values);

  const created = await db.transaction(async (tx) => {
    const [application] = await tx
      .select({
        id: applications.id,
        candidateId: applications.candidateId,
        jobId: applications.jobId,
      })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, input.workspaceId),
          eq(applications.id, input.applicationId),
        ),
      )
      .limit(1);
    if (!application) throw ApiError.notFound("Application not found.");

    const [offer] = await tx
      .insert(offers)
      .values({
        workspaceId: input.workspaceId,
        applicationId: application.id,
        candidateId: application.candidateId,
        jobId: application.jobId,
        status: "draft",
        ...input.values,
        createdById: input.actorUserId,
      })
      .returning();

    await tx.insert(activityEvents).values({
      workspaceId: input.workspaceId,
      actorId: input.actorUserId,
      entityType: "application",
      entityId: application.id,
      type: "offer.created",
      metadata: { title: offer.title },
    });
    return offer;
  });

  return created;
}

export async function updateOfferForApi(input: {
  workspaceId: string;
  offerId: string;
  values: Partial<OfferApiInput>;
}): Promise<Offer> {
  const existing = await getOfferForApi(input);
  if (existing.status !== "draft") {
    throw ApiError.conflict("Only draft offers can be edited.");
  }

  const values = { ...existing, ...input.values };
  assertOfferTermsOrThrow(values);
  const [updated] = await db
    .update(offers)
    .set({
      title: values.title,
      salaryAmount: values.salaryAmount,
      currency: values.currency,
      salaryPeriod: values.salaryPeriod,
      equity: values.equity,
      startDate: values.startDate,
      expiresAt: values.expiresAt,
      notes: values.notes,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(offers.workspaceId, input.workspaceId),
        eq(offers.id, input.offerId),
      ),
    )
    .returning();
  return updated;
}

/** Queue durable offer email; only outbox processor may set status `sent`. */
export async function sendOfferForApi(input: {
  workspaceId: string;
  actorUserId: string;
  offerId: string;
}): Promise<Offer> {
  const offer = await getOfferForApi(input);
  if (offer.status !== "draft") {
    throw ApiError.conflict("Only draft offers can be sent.");
  }
  if (offerHasExpired(offer.expiresAt)) {
    throw ApiError.conflict(
      "This offer has expired and can no longer be sent.",
    );
  }

  const [candidate] = await db
    .select({ email: candidates.email })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, input.workspaceId),
        eq(candidates.id, offer.candidateId),
      ),
    )
    .limit(1);
  if (!candidate?.email) {
    throw ApiError.unprocessable(
      "The candidate does not have an email address.",
    );
  }

  // enqueueEmailOutbox dedupes by a hash of (kind, payload), so a double send
  // (double-click, retry, AI agent) reuses the same outbox row instead of
  // creating duplicates and double-counting deliveries / offer.sent events.
  const outboxId = await enqueueEmailOutbox(
    input.workspaceId,
    "offer.extended",
    { offerId: offer.id, actorId: input.actorUserId },
  );

  await processEmailOutbox({ ids: [outboxId] });
  const [delivery] = await db
    .select({ status: emailOutbox.status })
    .from(emailOutbox)
    .where(eq(emailOutbox.id, outboxId))
    .limit(1);
  if (delivery?.status !== "sent") {
    throw ApiError.internal(
      "Offer delivery failed. It has been queued for retry.",
    );
  }
  return getOfferForApi(input);
}

export async function decideOfferForApi(input: {
  workspaceId: string;
  actorUserId: string;
  offerId: string;
  decision: "accepted" | "declined";
}): Promise<Offer> {
  const offer = await getOfferForApi(input);
  if (offer.status !== "sent") {
    throw ApiError.conflict("Only sent offers can be decided.");
  }
  if (offerHasExpired(offer.expiresAt)) {
    throw ApiError.conflict(
      "This offer has expired and can no longer be decided.",
    );
  }

  const decided = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(offers)
      .set({
        status: input.decision,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(offers.workspaceId, input.workspaceId),
          eq(offers.id, offer.id),
          eq(offers.status, "sent"),
        ),
      )
      .returning();
    if (!updated) throw ApiError.conflict("Only sent offers can be decided.");

    if (input.decision === "accepted") {
      const [application] = await tx
        .select({
          id: applications.id,
          status: applications.status,
          currentStageId: applications.currentStageId,
        })
        .from(applications)
        .where(
          and(
            eq(applications.workspaceId, input.workspaceId),
            eq(applications.id, offer.applicationId),
          ),
        )
        .limit(1);
      if (!application) throw ApiError.notFound("Application not found.");
      // Guard: accepting an offer moves the application to `hired`. Refuse if
      // the application is no longer `active` (rejected/withdrawn/hired by
      // another flow) — otherwise we'd silently revive a dead candidacy or
      // overwrite a competing decision. Roll back the offer update too.
      if (application.status !== "active") {
        throw ApiError.conflict(
          "This application is no longer active. Refresh and try again.",
        );
      }

      const [hiredStage] = await tx
        .select({ id: jobStages.id })
        .from(jobStages)
        .where(
          and(
            eq(jobStages.workspaceId, input.workspaceId),
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
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(applications.workspaceId, input.workspaceId),
            eq(applications.id, application.id),
          ),
        );

      if (hiredStage && hiredStage.id !== application.currentStageId) {
        await tx.insert(applicationStageHistory).values({
          workspaceId: input.workspaceId,
          applicationId: application.id,
          fromStageId: application.currentStageId,
          toStageId: hiredStage.id,
          movedById: input.actorUserId,
        });
      }
      await tx.insert(activityEvents).values({
        workspaceId: input.workspaceId,
        actorId: input.actorUserId,
        entityType: "application",
        entityId: application.id,
        type: "application.hired",
        metadata: { via: "offer", offerId: offer.id },
      });
    }

    await tx.insert(activityEvents).values({
      workspaceId: input.workspaceId,
      actorId: input.actorUserId,
      entityType: "application",
      entityId: offer.applicationId,
      type: input.decision === "accepted" ? "offer.accepted" : "offer.declined",
      metadata: { title: offer.title },
    });
    return {
      decided: updated,
      event:
        input.decision === "accepted"
          ? await persistDomainEvent(tx, {
              name: "application.hired",
              workspaceId: input.workspaceId,
              actorId: input.actorUserId,
              aggregateType: "application",
              aggregateId: offer.applicationId,
              payload: {
                application: { id: offer.applicationId, jobId: offer.jobId },
                candidate: { id: offer.candidateId },
                offer: { id: offer.id, title: offer.title },
              },
            })
          : null,
    };
  });

  if (decided.event) {
    await publishPersistedDomainEvents([decided.event]);
    await emitWebhookEvent(input.workspaceId, "application.hired", {
      application: { id: offer.applicationId, jobId: offer.jobId },
      candidate: { id: offer.candidateId },
      offer: { id: offer.id, title: offer.title },
    }, { actorId: input.actorUserId, skipDomainEvent: true });
  }
  return decided.decided;
}

export async function withdrawOfferForApi(input: {
  workspaceId: string;
  actorUserId: string;
  offerId: string;
}): Promise<Offer> {
  const offer = await getOfferForApi(input);
  if (offer.status !== "draft" && offer.status !== "sent") {
    throw ApiError.conflict("This offer can no longer be withdrawn.");
  }

  const withdrawn = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(offers)
      .set({
        status: "withdrawn",
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(offers.workspaceId, input.workspaceId),
          eq(offers.id, offer.id),
          or(eq(offers.status, "draft"), eq(offers.status, "sent")),
        ),
      )
      .returning();
    if (!updated)
      throw ApiError.conflict("This offer can no longer be withdrawn.");

    await tx.insert(activityEvents).values({
      workspaceId: input.workspaceId,
      actorId: input.actorUserId,
      entityType: "application",
      entityId: offer.applicationId,
      type: "offer.withdrawn",
      metadata: { title: offer.title },
    });
    return updated;
  });

  if (offer.status === "sent") {
    const recipient = await getOfferRecipient(
      input.workspaceId,
      offer.candidateId,
    );
    if (recipient?.email) {
      const id = await enqueueEmailOutbox(
        input.workspaceId,
        "offer.withdrawn",
        {
          candidateEmail: recipient.email,
          candidateName: recipient.firstName,
          companyName: recipient.companyName,
          jobTitle: offer.title,
        },
      );
      await processEmailOutbox({ ids: [id], workspaceId: input.workspaceId });
    }
  }

  return withdrawn;
}
