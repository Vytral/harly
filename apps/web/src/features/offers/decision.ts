import "server-only";

import { and, eq } from "drizzle-orm";

import {
  activityEvents,
  applications,
  applicationStageHistory,
  offers,
  type Offer,
} from "@harly/db";

import { ensureStageOfKind } from "@/features/pipeline/stage-resolver";
import {
  persistDomainEvent,
  type PersistedDomainEvent,
} from "@/server/events/emit";
import {
  withdrawSiblingApplicationsForHire,
  type SiblingWithdrawal,
} from "./withdraw-siblings";

/**
 * The single offer-decision transition (sent -> accepted | declined), shared
 * by the dashboard action (`decideOffer`) and the REST API
 * (`decideOfferForApi`). Both callers used to carry their own copy and the
 * copies drifted; keep every rule below in this one place.
 *
 * Rules:
 *  - The application row is locked FOR UPDATE before anything is written, so
 *    two concurrent decisions (or a decision racing a reject/withdraw) are
 *    serialized instead of interleaving.
 *  - The hire guard always applies when accepting: the application must still
 *    be `active`. Otherwise accepting would silently revive a rejected or
 *    withdrawn candidacy or overwrite a competing decision. The whole
 *    transaction is rolled back (the offer is not marked accepted).
 *  - Accepting is always recorded as a stage move into the job's `hired`
 *    stage (found by kind, created when missing), withdraws the candidate's
 *    sibling applications and writes the `application.hired` activity.
 *  - The offer.accepted / offer.declined activity row and the domain event
 *    are written inside the same transaction as the offer mutation.
 *
 * Callers do the post-commit work (publishing the returned events, webhooks,
 * notifications) themselves.
 */

export type OfferDecision = "accepted" | "declined";

export type OfferDecisionErrorCode =
  | "offerChanged"
  | "applicationNotFound"
  | "applicationNotActive"
  | "applicationChanged";

/** A rule that refuses the decision; callers map `code` to their own error type. */
export class OfferDecisionError extends Error {
  constructor(readonly code: OfferDecisionErrorCode) {
    super(code);
  }
}

type Tx = Parameters<Parameters<typeof import("@harly/db").db.transaction>[0]>[0];

export type OfferDecisionResult = {
  offer: Offer;
  hiredEvent: PersistedDomainEvent | null;
  siblingWithdrawals: SiblingWithdrawal[];
};

export async function applyOfferDecision(
  tx: Tx,
  input: {
    workspaceId: string;
    actorUserId: string;
    offer: Pick<
      Offer,
      "id" | "applicationId" | "candidateId" | "jobId" | "title"
    >;
    decision: OfferDecision;
  },
): Promise<OfferDecisionResult> {
  const { workspaceId, actorUserId, offer, decision } = input;

  // Lock the application first (accept only: a decline never touches it) so
  // every writer takes the locks in the same order.
  let application:
    | { id: string; status: string; currentStageId: string | null }
    | undefined;
  if (decision === "accepted") {
    [application] = await tx
      .select({
        id: applications.id,
        status: applications.status,
        currentStageId: applications.currentStageId,
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
    if (!application) throw new OfferDecisionError("applicationNotFound");
    if (application.status !== "active") {
      throw new OfferDecisionError("applicationNotActive");
    }
  }

  const [updated] = await tx
    .update(offers)
    .set({ status: decision, decidedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(offers.workspaceId, workspaceId),
        eq(offers.id, offer.id),
        eq(offers.status, "sent"),
      ),
    )
    .returning();
  if (!updated) throw new OfferDecisionError("offerChanged");

  let siblingWithdrawals: SiblingWithdrawal[] = [];
  if (decision === "accepted" && application) {
    // A hire is always recorded as a stage move. The hired stage is found by
    // kind (not by name) and created when the job has none, so the
    // application never ends up `hired` without a history row.
    const hiredStage = await ensureStageOfKind(tx, {
      workspaceId,
      jobId: offer.jobId,
      kind: "hired",
    });

    const [hired] = await tx
      .update(applications)
      .set({
        status: "hired",
        currentStageId: hiredStage.id,
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
    if (!hired) throw new OfferDecisionError("applicationChanged");

    if (hiredStage.id !== application.currentStageId) {
      await tx.insert(applicationStageHistory).values({
        workspaceId,
        applicationId: application.id,
        fromStageId: application.currentStageId,
        toStageId: hiredStage.id,
        movedById: actorUserId,
      });
    }

    siblingWithdrawals = await withdrawSiblingApplicationsForHire(tx, {
      workspaceId,
      candidateId: offer.candidateId,
      hiredApplicationId: application.id,
      actorUserId,
    });

    await tx.insert(activityEvents).values({
      workspaceId,
      actorId: actorUserId,
      entityType: "application",
      entityId: application.id,
      type: "application.hired",
      metadata: { via: "offer", offerId: offer.id },
    });
  }

  // Audit log inside the tx so it is atomic with the decision mutation.
  await tx.insert(activityEvents).values({
    workspaceId,
    actorId: actorUserId,
    entityType: "application",
    entityId: offer.applicationId,
    type: decision === "accepted" ? "offer.accepted" : "offer.declined",
    metadata: { title: offer.title },
  });

  const hiredEvent =
    decision === "accepted"
      ? await persistDomainEvent(tx, {
          name: "application.hired",
          workspaceId,
          actorId: actorUserId,
          aggregateType: "application",
          aggregateId: offer.applicationId,
          payload: {
            application: { id: offer.applicationId, jobId: offer.jobId },
            candidate: { id: offer.candidateId },
            offer: { id: offer.id, title: offer.title },
          },
        })
      : null;

  return { offer: updated, hiredEvent, siblingWithdrawals };
}
