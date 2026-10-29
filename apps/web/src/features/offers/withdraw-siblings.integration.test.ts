import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import {
  applicationStageHistory,
  applications,
  activityEvents,
  candidates,
  db,
  domainEventOutbox,
  jobStages,
} from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

const webhookMock = vi.hoisted(() => ({ emitWebhookEvent: vi.fn(async () => undefined) }));
vi.mock("@/server/webhooks/emit", () => webhookMock);

import {
  publishSiblingWithdrawals,
  withdrawSiblingApplicationsForHire,
} from "./withdraw-siblings";

describe.skipIf(!runPipelineIntegration)("withdrawSiblingApplicationsForHire", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
  });
  afterAll(async () => {
    await fx?.cleanup();
  });
  beforeEach(() => {
    webhookMock.emitWebhookEvent.mockClear();
  });

  async function setup() {
    const [candidate] = await db
      .insert(candidates)
      .values({
        workspaceId: fx.workspaceId,
        firstName: "Sibling",
        lastName: crypto.randomUUID().slice(0, 6),
        email: `sibling-${crypto.randomUUID()}@example.test`,
      })
      .returning({ id: candidates.id });
    const hiredJob = await fx.addJob();
    const otherJob = await fx.addJob();
    const [hired] = await db
      .insert(applications)
      .values({
        workspaceId: fx.workspaceId,
        candidateId: candidate.id,
        jobId: hiredJob.jobId,
        currentStageId: hiredJob.stages.offer!.id,
      })
      .returning({ id: applications.id });
    const [sibling] = await db
      .insert(applications)
      .values({
        workspaceId: fx.workspaceId,
        candidateId: candidate.id,
        jobId: otherJob.jobId,
        currentStageId: otherJob.stages.interview!.id,
      })
      .returning({ id: applications.id });
    return { candidateId: candidate.id, hiredId: hired.id, siblingId: sibling.id, otherJob };
  }

  it("places each sibling in its job's withdrawn stage with history and an outcome event", async () => {
    const { candidateId, hiredId, siblingId, otherJob } = await setup();

    await db.transaction((tx) =>
      withdrawSiblingApplicationsForHire(tx, {
        workspaceId: fx.workspaceId,
        candidateId,
        hiredApplicationId: hiredId,
        actorUserId: fx.userId,
      }),
    );

    const [sibling] = await db
      .select({ status: applications.status, stageId: applications.currentStageId })
      .from(applications)
      .where(eq(applications.id, siblingId));
    expect(sibling.status).toBe("withdrawn");

    const [stage] = await db
      .select({ kind: jobStages.kind, name: jobStages.name })
      .from(jobStages)
      .where(eq(jobStages.id, sibling.stageId));
    expect(stage.kind).toBe("withdrawn");
    expect(stage.name).toBe("Withdrawn");
    expect(sibling.stageId).not.toBe(otherJob.stages.interview!.id);

    const history = await db
      .select()
      .from(applicationStageHistory)
      .where(eq(applicationStageHistory.applicationId, siblingId));
    expect(history.some((row) => row.fromStageId === otherJob.stages.interview!.id && row.toStageId === sibling.stageId)).toBe(true);

    const outbox = await db
      .select({ eventName: domainEventOutbox.eventName })
      .from(domainEventOutbox)
      .where(
        and(
          eq(domainEventOutbox.aggregateId, siblingId),
          eq(domainEventOutbox.eventName, "application.stage_changed"),
        ),
      );
    expect(outbox).toHaveLength(1);

    expect(webhookMock.emitWebhookEvent).not.toHaveBeenCalled();
    const activity = await db
      .select({ type: activityEvents.type })
      .from(activityEvents)
      .where(and(eq(activityEvents.entityId, siblingId), eq(activityEvents.type, "application.withdrawn")));
    expect(activity).toHaveLength(1);
  });

  it("publishes a webhook for each sibling only after the hire commits", async () => {
    const { candidateId, hiredId, siblingId } = await setup();
    const withdrawals = await db.transaction((tx) =>
      withdrawSiblingApplicationsForHire(tx, {
        workspaceId: fx.workspaceId,
        candidateId,
        hiredApplicationId: hiredId,
        actorUserId: fx.userId,
      }),
    );
    expect(webhookMock.emitWebhookEvent).not.toHaveBeenCalled();

    await publishSiblingWithdrawals({
      workspaceId: fx.workspaceId,
      actorUserId: fx.userId,
      withdrawals,
    });
    expect(webhookMock.emitWebhookEvent).toHaveBeenCalledTimes(1);
    const [, event, data, options] = webhookMock.emitWebhookEvent.mock.calls[0] as unknown as [
      string,
      string,
      { application: { id: string; status: string }; toStageId: string },
      { skipDomainEvent: boolean; eventId: string },
    ];
    expect(event).toBe("application.stage_changed");
    expect(data.application.id).toBe(siblingId);
    expect(data.application.status).toBe("withdrawn");
    expect(data.toStageId).toBe(withdrawals[0].toStageId);
    expect(options.skipDomainEvent).toBe(true);
    expect(options.eventId).toBe(withdrawals[0].event?.eventId);
  });

  it("does nothing when the candidate has no other active application", async () => {
    const [candidate] = await db
      .insert(candidates)
      .values({
        workspaceId: fx.workspaceId,
        firstName: "Solo",
        lastName: crypto.randomUUID().slice(0, 6),
        email: `solo-${crypto.randomUUID()}@example.test`,
      })
      .returning({ id: candidates.id });
    const { applicationId } = await fx.addApplication({ stageId: fx.stages.hired!.id, status: "hired" });
    const result = await db.transaction((tx) =>
      withdrawSiblingApplicationsForHire(tx, {
        workspaceId: fx.workspaceId,
        candidateId: candidate.id,
        hiredApplicationId: applicationId,
        actorUserId: fx.userId,
      }),
    );
    expect(result).toEqual([]);
  });
});
