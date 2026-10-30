import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";

import {
  applicationStageHistory,
  applications,
  db,
  jobStages,
  member,
  offers,
  type JobStage,
} from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

// Real Postgres, real service and action code. Only request context, auth
// checks and outbound side effects (webhooks, email, background queues) are
// stubbed, so the assertions cover what is actually written.

const session = vi.hoisted(() => ({ workspaceId: "", userId: "" }));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: session.workspaceId, name: "Fixture" },
    user: { id: session.userId, name: "Fixture", email: "fixture@example.test" },
  })),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: vi.fn(async () => undefined),
  requireApplicationPermission: vi.fn(async () => undefined),
  requireOfferPermission: vi.fn(async () => undefined),
  getRolePolicy: vi.fn(async () => ({
    permissions: [],
    scope: { jobAccess: "all", departments: [], regions: [] },
  })),
}));
vi.mock("@/server/events/emit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/events/emit")>()),
  publishPersistedDomainEvents: vi.fn(async () => undefined),
}));
vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: vi.fn(async () => undefined),
}));
vi.mock("@/features/applications/notifications", () => ({
  notifyApplicationStatusChange: vi.fn(async () => undefined),
}));
vi.mock("@/features/pipeline/emails", () => ({
  sendPipelineEmails: vi.fn(async () => ({ queued: 0, sent: 0, failed: 0 })),
}));
vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: vi.fn(async () => undefined),
  processEmailOutbox: vi.fn(async () => undefined),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getActionHandler, type ActionContext } from "@/features/automations/registry";
import { createApplicationForApi, setApplicationStatusForWorkflow } from "@/features/applications/service";
import { createJobForApi } from "@/features/jobs/service";
import { createJob } from "@/features/jobs/data";
import { decideOfferForApi } from "@/features/offers/service";
import { getPipelineData } from "@/features/pipeline/data";
import { updateApplicationStatus } from "@/features/pipeline/actions";

async function stagesOf(jobId: string) {
  return db
    .select()
    .from(jobStages)
    .where(eq(jobStages.jobId, jobId))
    .orderBy(asc(jobStages.order));
}

async function activeStagesOf(jobId: string) {
  return (await stagesOf(jobId)).filter((stage) => !stage.archivedAt);
}

async function applicationOf(applicationId: string) {
  const [row] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!row) throw new Error(`application ${applicationId} not found`);
  return row;
}

async function historyOf(applicationId: string) {
  return db
    .select()
    .from(applicationStageHistory)
    .where(eq(applicationStageHistory.applicationId, applicationId))
    .orderBy(asc(applicationStageHistory.createdAt));
}

async function archiveStage(stage: Pick<JobStage, "id">) {
  await db
    .update(jobStages)
    .set({ archivedAt: new Date() })
    .where(eq(jobStages.id, stage.id));
}

async function renameStage(stage: Pick<JobStage, "id">, name: string) {
  await db.update(jobStages).set({ name }).where(eq(jobStages.id, stage.id));
}

async function sentOffer(input: {
  jobId: string;
  applicationId: string;
  candidateId: string;
}) {
  const [offer] = await db
    .insert(offers)
    .values({
      workspaceId: session.workspaceId,
      applicationId: input.applicationId,
      candidateId: input.candidateId,
      jobId: input.jobId,
      title: "Engineer",
      status: "sent",
      createdById: session.userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning({ id: offers.id });
  return offer.id;
}

function automationContext(applicationId: string): ActionContext {
  return {
    workspaceId: session.workspaceId,
    actorUserId: session.userId,
    triggerEvent: "application.created",
    triggerPayload: {},
    effectKey: `effect-${applicationId}`,
    runId: randomUUID(),
    target: {
      applicationId,
      candidateId: null,
      jobId: null,
      interviewId: null,
      offerId: null,
    },
  } as unknown as ActionContext;
}

describe.skipIf(!runPipelineIntegration)("stage kind consumers", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
    session.workspaceId = fx.workspaceId;
    session.userId = fx.userId;
    // Automations act as their creator and resolve the creator's role, so the
    // fixture user needs a membership. The fixture user is an owner.
    const now = new Date();
    await db.insert(member).values({
      id: `stage-kind-owner-${fx.workspaceId}`,
      organizationId: fx.workspaceId,
      userId: fx.userId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  describe("offer acceptance", () => {
    it("hires into the default Hired stage and records the move in history", async () => {
      const { applicationId, candidateId } = await fx.addApplication({
        stageId: fx.stages.interview!.id,
      });
      const offerId = await sentOffer({
        jobId: fx.jobId,
        applicationId,
        candidateId,
      });

      await decideOfferForApi({
        workspaceId: fx.workspaceId,
        actorUserId: fx.userId,
        offerId,
        decision: "accepted",
      });

      const app = await applicationOf(applicationId);
      expect(app.status).toBe("hired");
      expect(app.currentStageId).toBe(fx.stages.hired!.id);
      const history = await historyOf(applicationId);
      expect(history.at(-1)).toMatchObject({
        fromStageId: fx.stages.interview!.id,
        toStageId: fx.stages.hired!.id,
      });
    });

    it("hires into a renamed hired stage without creating another one", async () => {
      const other = await fx.addJob();
      await renameStage(other.stages.hired!, "Joined");
      const { applicationId, candidateId } = await fx.addApplication({
        stageId: other.stages.interview!.id,
        jobId: other.jobId,
      });
      const offerId = await sentOffer({
        jobId: other.jobId,
        applicationId,
        candidateId,
      });

      await decideOfferForApi({
        workspaceId: fx.workspaceId,
        actorUserId: fx.userId,
        offerId,
        decision: "accepted",
      });

      const app = await applicationOf(applicationId);
      expect(app.status).toBe("hired");
      expect(app.currentStageId).toBe(other.stages.hired!.id);
      expect(await activeStagesOf(other.jobId)).toHaveLength(6);
    });

    it("creates a Hired stage and records the hire when the job has none", async () => {
      const other = await fx.addJob();
      await archiveStage(other.stages.hired!);
      const { applicationId, candidateId } = await fx.addApplication({
        stageId: other.stages.interview!.id,
        jobId: other.jobId,
      });
      const offerId = await sentOffer({
        jobId: other.jobId,
        applicationId,
        candidateId,
      });

      await decideOfferForApi({
        workspaceId: fx.workspaceId,
        actorUserId: fx.userId,
        offerId,
        decision: "accepted",
      });

      const app = await applicationOf(applicationId);
      expect(app.status).toBe("hired");
      expect(app.currentStageId).not.toBe(other.stages.hired!.id);
      const hiredStage = (await stagesOf(other.jobId)).find(
        (stage) => stage.id === app.currentStageId,
      );
      expect(hiredStage).toMatchObject({ kind: "hired", name: "Hired", archivedAt: null });
      const history = await historyOf(applicationId);
      expect(history.at(-1)).toMatchObject({
        fromStageId: other.stages.interview!.id,
        toStageId: app.currentStageId,
      });
    });
  });

  describe("status changes", () => {
    it("rejecting creates the Rejected stage when the job has none", async () => {
      const other = await fx.addJob();
      await archiveStage(other.stages.rejected!);
      const { applicationId } = await fx.addApplication({
        stageId: other.stages.interview!.id,
        jobId: other.jobId,
      });

      const result = await updateApplicationStatus({
        workspaceId: fx.workspaceId,
        applicationIds: [applicationId],
        status: "rejected",
      });

      expect(result).toEqual({ success: true });
      const app = await applicationOf(applicationId);
      expect(app.status).toBe("rejected");
      const rejectedStage = (await stagesOf(other.jobId)).find(
        (stage) => stage.id === app.currentStageId,
      );
      expect(rejectedStage).toMatchObject({ kind: "rejected", archivedAt: null });
      expect((await historyOf(applicationId)).at(-1)?.toStageId).toBe(app.currentStageId);
    });

    it("withdrawing creates the Withdrawn stage when the job has none", async () => {
      const other = await fx.addJob();
      const { applicationId } = await fx.addApplication({
        stageId: other.stages.screening!.id,
        jobId: other.jobId,
      });

      const result = await setApplicationStatusForWorkflow({
        workspaceId: fx.workspaceId,
        applicationId,
        status: "withdrawn",
      });

      expect(result.status).toBe("withdrawn");
      const app = await applicationOf(applicationId);
      const withdrawnStage = (await stagesOf(other.jobId)).find(
        (stage) => stage.id === app.currentStageId,
      );
      expect(withdrawnStage).toMatchObject({ kind: "withdrawn", name: "Withdrawn" });
    });

    it("reactivation returns the application to the stage it was rejected from", async () => {
      const other = await fx.addJob();
      const { applicationId } = await fx.addApplication({
        stageId: other.stages.interview!.id,
        jobId: other.jobId,
      });
      await updateApplicationStatus({
        workspaceId: fx.workspaceId,
        applicationIds: [applicationId],
        status: "rejected",
      });

      const result = await updateApplicationStatus({
        workspaceId: fx.workspaceId,
        applicationIds: [applicationId],
        status: "active",
      });

      expect(result).toEqual({ success: true });
      const app = await applicationOf(applicationId);
      expect(app.status).toBe("active");
      expect(app.currentStageId).toBe(other.stages.interview!.id);
    });

    it("reactivation without history falls back to the entry stage", async () => {
      const other = await fx.addJob();
      const { applicationId } = await fx.addApplication({
        stageId: other.stages.rejected!.id,
        status: "rejected",
        jobId: other.jobId,
      });

      const result = await updateApplicationStatus({
        workspaceId: fx.workspaceId,
        applicationIds: [applicationId],
        status: "active",
      });

      expect(result).toEqual({ success: true });
      const app = await applicationOf(applicationId);
      expect(app.status).toBe("active");
      expect(app.currentStageId).toBe(other.stages.applied!.id);
    });

    it("reactivation never lands in a terminal stage that was the previous stage", async () => {
      const other = await fx.addJob();
      const { applicationId } = await fx.addApplication({
        stageId: other.stages.interview!.id,
        jobId: other.jobId,
      });
      await updateApplicationStatus({
        workspaceId: fx.workspaceId,
        applicationIds: [applicationId],
        status: "withdrawn",
      });
      await updateApplicationStatus({
        workspaceId: fx.workspaceId,
        applicationIds: [applicationId],
        status: "rejected",
      });

      await updateApplicationStatus({
        workspaceId: fx.workspaceId,
        applicationIds: [applicationId],
        status: "active",
      });

      const app = await applicationOf(applicationId);
      expect(app.status).toBe("active");
      // The most recent open stage it came from is Interview, not Withdrawn.
      expect(app.currentStageId).toBe(other.stages.interview!.id);
    });
  });

  describe("new applications", () => {
    it("lands in the first non-terminal stage when the first-ordered stage is terminal", async () => {
      const other = await fx.addJob();
      const hired = other.stages.hired!;
      await db.update(jobStages).set({ order: -1 }).where(eq(jobStages.id, hired.id));
      const { candidateId } = await fx.addApplication({ stageId: fx.stages.applied!.id });

      const app = await createApplicationForApi({
        workspaceId: fx.workspaceId,
        jobId: other.jobId,
        candidateId,
      });

      expect(app.currentStageId).toBe(other.stages.applied!.id);
    });

    it("skips archived stages when choosing the entry stage", async () => {
      const other = await fx.addJob();
      await archiveStage(other.stages.applied!);
      const { candidateId } = await fx.addApplication({ stageId: fx.stages.applied!.id });

      const app = await createApplicationForApi({
        workspaceId: fx.workspaceId,
        jobId: other.jobId,
        candidateId,
      });

      expect(app.currentStageId).toBe(other.stages.screening!.id);
    });
  });

  describe("job creation", () => {
    it("API service inserts the six default stages with their kinds", async () => {
      const job = await createJobForApi({
        workspaceId: fx.workspaceId,
        actorUserId: fx.userId,
        values: {
          title: "API created role",
          description: "Synthetic description",
          employmentType: "full_time",
          workplaceType: "remote",
        },
      });

      const stages = await stagesOf(job.id);
      expect(stages.map((stage) => [stage.name, stage.kind])).toEqual([
        ["Applied", "applied"],
        ["Screening", "screening"],
        ["Interview", "interview"],
        ["Offer", "offer"],
        ["Hired", "hired"],
        ["Rejected", "rejected"],
      ]);
    });

    it("UI data layer inserts the six default stages with their kinds", async () => {
      const job = await createJob({
        title: "UI created role",
        description: "Synthetic description",
        employmentType: "full_time",
        workplaceType: "remote",
        applicationConfig: { questions: [] },
      } as unknown as Parameters<typeof createJob>[0]);

      const stages = await stagesOf(job.id);
      expect(stages.map((stage) => stage.kind)).toEqual([
        "applied",
        "screening",
        "interview",
        "offer",
        "hired",
        "rejected",
      ]);
    });
  });

  describe("automations", () => {
    it("set_status hired moves into the stage of kind hired even when it was renamed", async () => {
      const other = await fx.addJob();
      await renameStage(other.stages.hired!, "Joined");
      const { applicationId } = await fx.addApplication({
        stageId: other.stages.interview!.id,
        jobId: other.jobId,
      });
      const handler = getActionHandler("set_status");
      expect(handler).toBeDefined();

      const result = await handler!.run({ status: "hired" }, automationContext(applicationId));

      expect(result.success).toBe(true);
      const app = await applicationOf(applicationId);
      expect(app.status).toBe("hired");
      expect(app.currentStageId).toBe(other.stages.hired!.id);
    });

    it("move_stage resolves an active stage by name and refuses archived ones", async () => {
      const other = await fx.addJob();
      await renameStage(other.stages.hired!, "Joined");
      await archiveStage(other.stages.offer!);
      const { applicationId } = await fx.addApplication({
        stageId: other.stages.applied!.id,
        jobId: other.jobId,
      });
      const handler = getActionHandler("move_stage");
      expect(handler).toBeDefined();

      const archived = await handler!.run({ toStageName: "offer" }, automationContext(applicationId));
      expect(archived).toMatchObject({ success: false });

      const moved = await handler!.run({ toStageName: "  joined " }, automationContext(applicationId));
      expect(moved.success).toBe(true);
      const app = await applicationOf(applicationId);
      expect(app.currentStageId).toBe(other.stages.hired!.id);
      expect(app.status).toBe("hired");
    });
  });

  describe("pipeline data", () => {
    it("returns each active stage with its kind and omits archived stages", async () => {
      const other = await fx.addJob();
      await archiveStage(other.stages.screening!);

      const data = await getPipelineData(other.jobId);

      expect(data.kind).toBe("ready");
      if (data.kind !== "ready") return;
      expect(data.stages.map((stage) => stage.name)).not.toContain("Screening");
      expect(data.stages.find((stage) => stage.name === "Hired")?.kind).toBe("hired");
      expect(data.stages.every((stage) => typeof stage.kind === "string")).toBe(true);
    });
  });
});
