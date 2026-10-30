import "server-only";

import { and, asc, eq, inArray, ne, or } from "drizzle-orm";

import { ApiError } from "@harly/api";
import {
  activityEvents,
  applicationStageHistory,
  applications,
  db,
  offers,
  type Application,
} from "@harly/db";

import {
  serializeApplication,
  stageForApplicationStatus,
} from "@/features/applications/service";
import {
  persistDomainEvent,
  publishPersistedDomainEvents,
  type PersistedDomainEvent,
} from "@/server/events/emit";
import { emitWebhookEvent } from "@/server/webhooks/emit";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One sibling application moved to its job's withdrawn stage by a hire. */
export type SiblingWithdrawal = {
  application: Application;
  fromStageId: string | null;
  toStageId: string;
  toStageName: string;
  event: PersistedDomainEvent | null;
};

/**
 * Withdraw every other active application (and their draft/sent offers) of a
 * hired candidate. Each sibling goes through the same placement as any
 * withdrawal: it is moved to the job's withdrawn stage, with stage history and
 * the same stage-change event a manual withdrawal records. Candidate-facing
 * emails and portal notifications are not sent.
 *
 * Runs inside the caller's transaction. The returned withdrawals carry
 * persisted domain events; publish them with `publishSiblingWithdrawals` after
 * the transaction commits.
 */
export async function withdrawSiblingApplicationsForHire(
  tx: Tx,
  input: {
    workspaceId: string;
    candidateId: string;
    hiredApplicationId: string;
    actorUserId: string;
  },
): Promise<SiblingWithdrawal[]> {
  // Lock the sibling rows in id order so a concurrent move cannot interleave
  // with this withdrawal and leave one of them in an active-kind stage.
  const sisters = await tx
    .select({
      id: applications.id,
      jobId: applications.jobId,
      currentStageId: applications.currentStageId,
    })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, input.workspaceId),
        eq(applications.candidateId, input.candidateId),
        ne(applications.id, input.hiredApplicationId),
        eq(applications.status, "active"),
      ),
    )
    .orderBy(asc(applications.id))
    .for("update");

  if (sisters.length === 0) return [];

  const withdrawals: SiblingWithdrawal[] = [];
  for (const sister of sisters) {
    const placed = await stageForApplicationStatus(tx, {
      workspaceId: input.workspaceId,
      jobId: sister.jobId,
      applicationId: sister.id,
      currentStageId: sister.currentStageId,
      status: "withdrawn",
    });
    if (!placed) {
      throw new Error("A withdrawn application must resolve to a withdrawn stage.");
    }

    const [updated] = await tx
      .update(applications)
      .set({
        status: "withdrawn",
        currentStageId: placed.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(applications.workspaceId, input.workspaceId),
          eq(applications.id, sister.id),
        ),
      )
      .returning();
    if (!updated) {
      throw ApiError.conflict(
        "An application changed while this hire was recorded. Refresh and try again.",
      );
    }

    const stageChanged = placed.id !== sister.currentStageId;
    if (stageChanged) {
      await tx.insert(applicationStageHistory).values({
        workspaceId: input.workspaceId,
        applicationId: sister.id,
        fromStageId: sister.currentStageId,
        toStageId: placed.id,
        movedById: input.actorUserId,
      });
      await tx.insert(activityEvents).values({
        workspaceId: input.workspaceId,
        actorId: input.actorUserId,
        entityType: "application",
        entityId: sister.id,
        type: "stage.changed",
        metadata: {
          fromStageId: sister.currentStageId,
          toStageId: placed.id,
          status: "withdrawn",
          source: "status_change",
        },
      });
    }

    await tx.insert(activityEvents).values({
      workspaceId: input.workspaceId,
      actorId: input.actorUserId,
      entityType: "application",
      entityId: sister.id,
      type: "application.withdrawn",
      metadata: {
        reason: "hired_for_another_role",
        hiredApplicationId: input.hiredApplicationId,
      },
    });

    const event = stageChanged
      ? await persistDomainEvent(tx, {
          name: "application.stage_changed",
          workspaceId: input.workspaceId,
          actorId: input.actorUserId,
          aggregateType: "application",
          aggregateId: sister.id,
          payload: {
            application: serializeApplication(updated),
            fromStageId: sister.currentStageId,
            toStageId: placed.id,
            toStageName: placed.name,
            status: "withdrawn",
          },
        })
      : null;

    withdrawals.push({
      application: updated,
      fromStageId: sister.currentStageId,
      toStageId: placed.id,
      toStageName: placed.name,
      event,
    });
  }

  await tx
    .update(offers)
    .set({
      status: "withdrawn",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(offers.workspaceId, input.workspaceId),
        inArray(
          offers.applicationId,
          withdrawals.map((withdrawal) => withdrawal.application.id),
        ),
        or(eq(offers.status, "draft"), eq(offers.status, "sent")),
      ),
    );

  return withdrawals;
}

/** Publish the sibling withdrawals after the hire transaction has committed. */
export async function publishSiblingWithdrawals(input: {
  workspaceId: string;
  actorUserId: string;
  withdrawals: readonly SiblingWithdrawal[];
}): Promise<void> {
  const events = input.withdrawals.flatMap((w) => (w.event ? [w.event] : []));
  await publishPersistedDomainEvents(events);
  for (const withdrawal of input.withdrawals) {
    if (!withdrawal.event) continue;
    await emitWebhookEvent(
      input.workspaceId,
      "application.stage_changed",
      {
        application: serializeApplication(withdrawal.application),
        fromStageId: withdrawal.fromStageId,
        toStageId: withdrawal.toStageId,
        toStageName: withdrawal.toStageName,
        status: "withdrawn",
        eventId: withdrawal.event.eventId,
      },
      {
        actorId: input.actorUserId,
        skipDomainEvent: true,
        eventId: withdrawal.event.eventId,
      },
    );
  }
}
