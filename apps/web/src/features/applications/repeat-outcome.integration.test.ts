import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import {
  applicationStageHistory,
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
vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: vi.fn(async () => "outbox-id"),
  processEmailOutbox: vi.fn(async () => ({ processed: 0, sent: 0, failed: 0 })),
}));

import { hireApplicationForApi, rejectApplicationForApi } from "./service";

describe.skipIf(!runPipelineIntegration)("repeating an application outcome", () => {
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

  async function counts(applicationId: string, eventName: string) {
    const history = await db
      .select({ id: applicationStageHistory.id })
      .from(applicationStageHistory)
      .where(eq(applicationStageHistory.applicationId, applicationId));
    const events = await db
      .select({ id: domainEventOutbox.eventId })
      .from(domainEventOutbox)
      .where(
        and(
          eq(domainEventOutbox.aggregateId, applicationId),
          eq(domainEventOutbox.eventName, eventName),
        ),
      );
    return { history: history.length, events: events.length };
  }

  it("re-rejecting an application already in a second rejected stage is a no-op", async () => {
    const job = await fx.addJob();
    const [notAFit] = await db
      .insert(jobStages)
      .values({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        name: "Not a fit",
        kind: "rejected",
        order: 20,
      })
      .returning();
    const { applicationId } = await fx.addApplication({
      stageId: notAFit!.id,
      status: "rejected",
      jobId: job.jobId,
    });
    const before = await counts(applicationId, "application.rejected");

    const result = await rejectApplicationForApi({
      workspaceId: fx.workspaceId,
      applicationId,
      actorId: fx.userId,
    });

    expect(result.status).toBe("rejected");
    expect(result.currentStageId).toBe(notAFit!.id);
    expect(await counts(applicationId, "application.rejected")).toEqual(before);
    expect(webhookMock.emitWebhookEvent).not.toHaveBeenCalled();
  });

  it("re-hiring an application already in a second hired stage is a no-op", async () => {
    const job = await fx.addJob();
    const [joined] = await db
      .insert(jobStages)
      .values({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        name: "Joined",
        kind: "hired",
        order: 20,
      })
      .returning();
    const { applicationId } = await fx.addApplication({
      stageId: joined!.id,
      status: "hired",
      jobId: job.jobId,
    });
    const before = await counts(applicationId, "application.hired");

    const result = await hireApplicationForApi({
      workspaceId: fx.workspaceId,
      applicationId,
      actorId: fx.userId,
    });

    expect(result.currentStageId).toBe(joined!.id);
    expect(await counts(applicationId, "application.hired")).toEqual(before);
    expect(webhookMock.emitWebhookEvent).not.toHaveBeenCalled();
  });
});
