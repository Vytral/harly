import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";

import { ApiError } from "@harly/api";
import {
  activityEvents,
  applicationStageHistory,
  applications,
  db,
  jobStages,
  workflowDefinitions,
  type JobStage,
} from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import {
  archiveStage,
  createStage,
  deleteStage,
  listJobStages,
  reorderStages,
  updateStage,
} from "./stage-lifecycle";

async function expectApiError(
  promise: Promise<unknown>,
  status: number,
): Promise<ApiError> {
  const error = await promise.then(
    () => {
      throw new Error("Expected the operation to fail");
    },
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

async function jobStageRows(jobId: string): Promise<JobStage[]> {
  return db
    .select()
    .from(jobStages)
    .where(eq(jobStages.jobId, jobId))
    .orderBy(asc(jobStages.order));
}

async function activeNames(jobId: string): Promise<string[]> {
  return (await jobStageRows(jobId))
    .filter((stage) => !stage.archivedAt)
    .map((stage) => stage.name);
}

describe.skipIf(!runPipelineIntegration)("stage lifecycle", () => {
  let fx: PipelineFixture;
  let other: PipelineFixture;

  const scope = () => ({
    workspaceId: fx.workspaceId,
    jobId: fx.jobId,
    actorUserId: fx.userId,
  });

  beforeAll(async () => {
    fx = await createPipelineFixture();
    other = await createPipelineFixture();
  });

  afterAll(async () => {
    await fx?.cleanup();
    await other?.cleanup();
  });

  describe("create", () => {
    it("inserts before the first terminal stage by default and records activity", async () => {
      const job = await fx.addJob();
      const jobScope = { workspaceId: fx.workspaceId, jobId: job.jobId, actorUserId: fx.userId };

      const created = await createStage({ ...jobScope, name: "Panel" });

      expect(created.kind).toBe("custom");
      expect(created.applicationCount).toBe(0);
      expect(await activeNames(job.jobId)).toEqual([
        "Applied",
        "Screening",
        "Interview",
        "Offer",
        "Panel",
        "Hired",
        "Rejected",
      ]);

      const events = await db
        .select()
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.entityId, job.jobId),
            eq(activityEvents.type, "job.stage_created"),
          ),
        );
      expect(events).toHaveLength(1);
      expect(events[0]?.actorId).toBe(fx.userId);
      expect(events[0]?.entityType).toBe("job");
    });

    it("inserts at an explicit position and shifts later stages", async () => {
      const job = await fx.addJob();
      const jobScope = { workspaceId: fx.workspaceId, jobId: job.jobId, actorUserId: fx.userId };

      await createStage({ ...jobScope, name: "Sourcing call", position: 0 });

      expect((await activeNames(job.jobId))[0]).toBe("Sourcing call");
      const rows = await jobStageRows(job.jobId);
      const orders = rows.filter((row) => !row.archivedAt).map((row) => row.order);
      expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it("allows several stages of one terminal kind", async () => {
      const first = await createStage({
        ...scope(),
        name: "Rejected - culture fit",
        kind: "rejected",
      });
      const second = await createStage({
        ...scope(),
        name: "Rejected - skills",
        kind: "rejected",
      });
      expect(first.kind).toBe("rejected");
      expect(second.kind).toBe("rejected");
    });

    it("refuses a name that matches an active stage case-insensitively", async () => {
      await expectApiError(
        createStage({ ...scope(), name: "  interview " }),
        409,
      );
    });

    it("refuses a position past the end of the active stages", async () => {
      await expectApiError(
        createStage({ ...scope(), name: "Too far", position: 999 }),
        422,
      );
    });

    it("refuses a stage created for a job in another workspace", async () => {
      await expectApiError(
        createStage({
          workspaceId: other.workspaceId,
          jobId: fx.jobId,
          actorUserId: other.userId,
          name: "Intruder",
        }),
        404,
      );
    });
  });

  describe("update", () => {
    it("keeps the kind when a hired stage is renamed", async () => {
      const job = await fx.addJob();
      const hired = job.stages.hired!;

      const updated = await updateStage({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        actorUserId: fx.userId,
        stageId: hired.id,
        patch: { name: "Successful hire" },
      });

      expect(updated.name).toBe("Successful hire");
      expect(updated.kind).toBe("hired");
    });

    it("persists the effective kind of a legacy NULL-kind row when it is renamed", async () => {
      const job = await fx.addJob();
      const hired = job.stages.hired!;
      await db.update(jobStages).set({ kind: null }).where(eq(jobStages.id, hired.id));

      const updated = await updateStage({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        actorUserId: fx.userId,
        stageId: hired.id,
        patch: { name: "Closed won" },
      });

      expect(updated.kind).toBe("hired");
      const [row] = await db.select().from(jobStages).where(eq(jobStages.id, hired.id));
      expect(row?.kind).toBe("hired");
    });

    it("allows a kind change between active kinds even with applications", async () => {
      const interview = fx.stages.interview!;
      await fx.addApplication({ stageId: interview.id });

      const updated = await updateStage({
        ...scope(),
        stageId: interview.id,
        patch: { kind: "custom" },
      });

      expect(updated.kind).toBe("custom");
      expect(updated.applicationCount).toBe(1);
    });

    it("refuses moving applications into an outcome by kind change", async () => {
      const job = await fx.addJob();
      const interview = job.stages.interview!;
      await fx.addApplication({ stageId: interview.id, jobId: job.jobId });

      await expectApiError(
        updateStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: interview.id,
          patch: { kind: "hired" },
        }),
        409,
      );
      const [row] = await db.select().from(jobStages).where(eq(jobStages.id, interview.id));
      expect(row?.kind).toBe("interview");
    });

    it("refuses leaving an outcome kind while applications sit in it", async () => {
      const job = await fx.addJob();
      const rejected = job.stages.rejected!;
      await fx.addApplication({
        stageId: rejected.id,
        jobId: job.jobId,
        status: "rejected",
      });

      await expectApiError(
        updateStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: rejected.id,
          patch: { kind: "custom" },
        }),
        409,
      );
    });

    it("allows changing the kind of an unused outcome stage", async () => {
      const job = await fx.addJob();
      const withdrawn = await createStage({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        actorUserId: fx.userId,
        name: "Dropped out",
        kind: "withdrawn",
      });

      const updated = await updateStage({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        actorUserId: fx.userId,
        stageId: withdrawn.id,
        patch: { kind: "custom" },
      });
      expect(updated.kind).toBe("custom");
    });

    it("rolls back a kind change that leaves no entry stage", async () => {
      const job = await fx.addJob();
      const stages = job.stages;
      // Reduce the pipeline to Offer + Hired + Rejected by removing unused stages first.
      for (const key of ["applied", "screening", "interview"] as const) {
        await deleteStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: stages[key]!.id,
        });
      }

      await expectApiError(
        updateStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: stages.offer!.id,
          patch: { kind: "hired" },
        }),
        409,
      );
      const [row] = await db.select().from(jobStages).where(eq(jobStages.id, stages.offer!.id));
      expect(row?.kind).toBe("offer");
    });

    it("refuses to edit an archived stage", async () => {
      const job = await fx.addJob();
      const screening = job.stages.screening!;
      await archiveStage({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        actorUserId: fx.userId,
        stageId: screening.id,
      });

      await expectApiError(
        updateStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: screening.id,
          patch: { name: "Revived" },
        }),
        409,
      );
    });

    it("refuses a rename that collides with another active stage", async () => {
      await expectApiError(
        updateStage({
          ...scope(),
          stageId: fx.stages.offer!.id,
          patch: { name: "applied" },
        }),
        409,
      );
    });

    it("refuses a stage id that belongs to another job or workspace", async () => {
      const otherJob = await fx.addJob();
      await expectApiError(
        updateStage({
          ...scope(),
          stageId: otherJob.stages.offer!.id,
          patch: { name: "Nope" },
        }),
        404,
      );
      await expectApiError(
        updateStage({
          workspaceId: other.workspaceId,
          jobId: fx.jobId,
          actorUserId: other.userId,
          stageId: fx.stages.offer!.id,
          patch: { name: "Nope" },
        }),
        404,
      );
    });
  });

  describe("reorder", () => {
    it("applies a new order and returns active stages in that order", async () => {
      const job = await fx.addJob();
      const jobScope = { workspaceId: fx.workspaceId, jobId: job.jobId, actorUserId: fx.userId };
      const ids = Object.values(job.stages).map((stage) => stage!.id);
      const reversed = [...ids].reverse();

      const result = await reorderStages({ ...jobScope, orderedStageIds: reversed });

      expect(result.map((stage) => stage.id)).toEqual(reversed);
      expect(await activeNames(job.jobId)).toEqual([
        "Rejected",
        "Hired",
        "Offer",
        "Interview",
        "Screening",
        "Applied",
      ]);
    });

    it("refuses lists that miss, repeat or add stages", async () => {
      const job = await fx.addJob();
      const jobScope = { workspaceId: fx.workspaceId, jobId: job.jobId, actorUserId: fx.userId };
      const ids = Object.values(job.stages).map((stage) => stage!.id);

      await expectApiError(
        reorderStages({ ...jobScope, orderedStageIds: ids.slice(1) }),
        400,
      );
      await expectApiError(
        reorderStages({ ...jobScope, orderedStageIds: [...ids.slice(1), ids[0]!, ids[0]!] }),
        400,
      );
      await expectApiError(
        reorderStages({
          ...jobScope,
          orderedStageIds: [...ids, fx.stages.applied!.id],
        }),
        400,
      );
    });

    it("serializes two concurrent reorders so both succeed and the final order is valid", async () => {
      const job = await fx.addJob();
      const jobScope = { workspaceId: fx.workspaceId, jobId: job.jobId, actorUserId: fx.userId };
      const ids = Object.values(job.stages).map((stage) => stage!.id);
      const forward = [...ids];
      const backward = [...ids].reverse();
      const rotated = [...ids.slice(2), ...ids.slice(0, 2)];

      const results = await Promise.all([
        reorderStages({ ...jobScope, orderedStageIds: backward }),
        reorderStages({ ...jobScope, orderedStageIds: rotated }),
        reorderStages({ ...jobScope, orderedStageIds: forward }),
      ]);

      expect(results).toHaveLength(3);
      const rows = (await jobStageRows(job.jobId)).filter((row) => !row.archivedAt);
      expect(rows.map((row) => row.order)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(new Set(rows.map((row) => row.id))).toEqual(new Set(ids));
    });
  });

  describe("archive", () => {
    it("moves applications to the merge target, writes history and activity, and keeps history intact", async () => {
      const job = await fx.addJob();
      const jobScope = { workspaceId: fx.workspaceId, jobId: job.jobId, actorUserId: fx.userId };
      const screening = job.stages.screening!;
      const interview = job.stages.interview!;

      await fx.addApplication({ stageId: interview.id, jobId: job.jobId });
      const moved = await fx.addApplication({ stageId: screening.id, jobId: job.jobId });
      const movedTwo = await fx.addApplication({ stageId: screening.id, jobId: job.jobId });

      const result = await archiveStage({
        ...jobScope,
        stageId: screening.id,
        mergeIntoStageId: interview.id,
      });

      expect(result.movedApplications).toBe(2);
      expect(result.stage.archivedAt).not.toBeNull();

      const [first] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, moved.applicationId));
      expect(first?.currentStageId).toBe(interview.id);
      expect(first?.status).toBe("active");
      expect(first?.pipelineOrder).toBe(1);

      const [second] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, movedTwo.applicationId));
      expect(second?.pipelineOrder).toBe(2);

      const history = await db
        .select()
        .from(applicationStageHistory)
        .where(
          and(
            eq(applicationStageHistory.applicationId, moved.applicationId),
            eq(applicationStageHistory.fromStageId, screening.id),
          ),
        );
      expect(history).toHaveLength(1);
      expect(history[0]?.toStageId).toBe(interview.id);
      expect(history[0]?.movedById).toBe(fx.userId);

      const mergeEvents = await db
        .select()
        .from(activityEvents)
        .where(
          and(eq(activityEvents.entityId, job.jobId), eq(activityEvents.type, "stage.changed")),
        );
      expect(mergeEvents).toHaveLength(1);
      expect((mergeEvents[0]?.metadata as { source?: string }).source).toBe("stage_merge");

      // Original history rows still point at the archived stage.
      const oldRows = await db
        .select()
        .from(applicationStageHistory)
        .where(eq(applicationStageHistory.toStageId, screening.id));
      expect(oldRows.length).toBeGreaterThan(0);

      const active = await listJobStages({ workspaceId: fx.workspaceId, jobId: job.jobId });
      expect(active.map((stage) => stage.name)).not.toContain("Screening");
      const withArchived = await listJobStages({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        includeArchived: true,
      });
      expect(withArchived.find((stage) => stage.id === screening.id)?.archivedAt).not.toBeNull();
      expect(withArchived.find((stage) => stage.id === interview.id)?.applicationCount).toBe(3);
    });

    it("refuses archiving a stage that holds applications without a merge target", async () => {
      const job = await fx.addJob();
      const screening = job.stages.screening!;
      const app = await fx.addApplication({ stageId: screening.id, jobId: job.jobId });

      await expectApiError(
        archiveStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: screening.id,
        }),
        422,
      );
      const [row] = await db.select().from(applications).where(eq(applications.id, app.applicationId));
      expect(row?.currentStageId).toBe(screening.id);
      const [stage] = await db.select().from(jobStages).where(eq(jobStages.id, screening.id));
      expect(stage?.archivedAt).toBeNull();
    });

    it("refuses a merge target whose outcome differs from the source's", async () => {
      const job = await fx.addJob();
      const rejected = job.stages.rejected!;
      const hired = job.stages.hired!;
      const interview = job.stages.interview!;
      await fx.addApplication({ stageId: rejected.id, jobId: job.jobId, status: "rejected" });
      await fx.addApplication({ stageId: interview.id, jobId: job.jobId });

      await expectApiError(
        archiveStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: rejected.id,
          mergeIntoStageId: hired.id,
        }),
        409,
      );
      await expectApiError(
        archiveStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: interview.id,
          mergeIntoStageId: hired.id,
        }),
        409,
      );
    });

    it("merges a rejected stage only into another rejected stage", async () => {
      const job = await fx.addJob();
      const rejected = job.stages.rejected!;
      const app = await fx.addApplication({
        stageId: rejected.id,
        jobId: job.jobId,
        status: "rejected",
      });
      const alternate = await createStage({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        actorUserId: fx.userId,
        name: "Rejected - skills",
        kind: "rejected",
      });

      const result = await archiveStage({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        actorUserId: fx.userId,
        stageId: rejected.id,
        mergeIntoStageId: alternate.id,
      });

      expect(result.movedApplications).toBe(1);
      const [row] = await db.select().from(applications).where(eq(applications.id, app.applicationId));
      expect(row?.currentStageId).toBe(alternate.id);
      expect(row?.status).toBe("rejected");
    });

    it("refuses a merge target that is archived, the source itself, or in another job", async () => {
      const job = await fx.addJob();
      const interview = job.stages.interview!;
      const screening = job.stages.screening!;
      await fx.addApplication({ stageId: screening.id, jobId: job.jobId });
      await archiveStage({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        actorUserId: fx.userId,
        stageId: interview.id,
      });

      await expectApiError(
        archiveStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: screening.id,
          mergeIntoStageId: interview.id,
        }),
        409,
      );
      await expectApiError(
        archiveStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: screening.id,
          mergeIntoStageId: screening.id,
        }),
        422,
      );
      await expectApiError(
        archiveStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: screening.id,
          mergeIntoStageId: fx.stages.offer!.id,
        }),
        404,
      );
    });

    it("frees the name of an archived stage and keeps reorder limited to active stages", async () => {
      const job = await fx.addJob();
      const jobScope = { workspaceId: fx.workspaceId, jobId: job.jobId, actorUserId: fx.userId };
      const screening = job.stages.screening!;

      await archiveStage({ ...jobScope, stageId: screening.id });
      const reused = await createStage({ ...jobScope, name: "Screening", kind: "screening" });
      expect(reused.id).not.toBe(screening.id);

      const active = (await listJobStages({ ...jobScope })).map((stage) => stage.id);
      await reorderStages({ ...jobScope, orderedStageIds: [...active].reverse() });

      const archivedRow = await db.select().from(jobStages).where(eq(jobStages.id, screening.id));
      expect(archivedRow[0]?.archivedAt).not.toBeNull();
      expect(await activeNames(job.jobId)).toContain("Screening");
    });

    it("refuses to archive the only active non-terminal stage", async () => {
      const job = await fx.addJob();
      for (const key of ["applied", "screening", "interview"] as const) {
        await deleteStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: job.stages[key]!.id,
        });
      }

      await expectApiError(
        archiveStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: job.stages.offer!.id,
        }),
        409,
      );
      const [row] = await db.select().from(jobStages).where(eq(jobStages.id, job.stages.offer!.id));
      expect(row?.archivedAt).toBeNull();
    });
  });

  describe("delete", () => {
    it("refuses deleting a stage that holds applications", async () => {
      const job = await fx.addJob();
      const offer = job.stages.offer!;
      await fx.addApplication({ stageId: offer.id, jobId: job.jobId });

      await expectApiError(
        deleteStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: offer.id,
        }),
        409,
      );
    });

    it("refuses deleting a stage that still appears in history after an archive", async () => {
      const job = await fx.addJob();
      const screening = job.stages.screening!;
      await fx.addApplication({ stageId: screening.id, jobId: job.jobId });
      await archiveStage({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        actorUserId: fx.userId,
        stageId: screening.id,
        mergeIntoStageId: job.stages.interview!.id,
      });

      await expectApiError(
        deleteStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: screening.id,
        }),
        409,
      );
      const [row] = await db.select().from(jobStages).where(eq(jobStages.id, screening.id));
      expect(row).toBeDefined();
    });

    it("deletes an unused stage", async () => {
      const job = await fx.addJob();
      const created = await createStage({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        actorUserId: fx.userId,
        name: "Scratch",
      });

      await deleteStage({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        actorUserId: fx.userId,
        stageId: created.id,
      });

      const rows = await db.select().from(jobStages).where(eq(jobStages.id, created.id));
      expect(rows).toHaveLength(0);
      expect(await activeNames(job.jobId)).not.toContain("Scratch");
      const events = await db
        .select()
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.entityId, job.jobId),
            eq(activityEvents.type, "job.stage_deleted"),
          ),
        );
      expect(events).toHaveLength(1);
    });

    it("refuses deleting a stage that an automation still references", async () => {
      const job = await fx.addJob();
      const scratch = await createStage({
        workspaceId: fx.workspaceId,
        jobId: job.jobId,
        actorUserId: fx.userId,
        name: "Automation target",
      });
      await db.insert(workflowDefinitions).values({
        workspaceId: fx.workspaceId,
        name: "Move to automation target",
        triggerEvent: "application.created",
        trigger: { event: "application.created" },
        conditions: [],
        actions: [{ type: "move_stage", config: { toStageId: scratch.id } }],
      });

      await expectApiError(
        deleteStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: scratch.id,
        }),
        409,
      );
    });

    it("refuses deleting the only active non-terminal stage even when it is unused", async () => {
      const job = await fx.addJob();
      for (const key of ["applied", "screening", "interview"] as const) {
        await deleteStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: job.stages[key]!.id,
        });
      }

      await expectApiError(
        deleteStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: job.stages.offer!.id,
        }),
        409,
      );
      const rows = await db.select().from(jobStages).where(eq(jobStages.id, job.stages.offer!.id));
      expect(rows).toHaveLength(1);
    });
  });

  describe("isolation", () => {
    it("returns 404 for a job that belongs to another workspace", async () => {
      await expectApiError(
        listJobStages({ workspaceId: other.workspaceId, jobId: fx.jobId }),
        404,
      );
      await expectApiError(
        createStage({
          workspaceId: other.workspaceId,
          jobId: fx.jobId,
          actorUserId: other.userId,
          name: "Cross tenant",
        }),
        404,
      );
    });

    it("returns 404 when an archive or delete targets a stage from another job", async () => {
      const job = await fx.addJob();
      const foreignStage = fx.stages.offer!.id;

      await expectApiError(
        archiveStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: foreignStage,
        }),
        404,
      );
      await expectApiError(
        deleteStage({
          workspaceId: fx.workspaceId,
          jobId: job.jobId,
          actorUserId: fx.userId,
          stageId: foreignStage,
        }),
        404,
      );
      const [row] = await db.select().from(jobStages).where(eq(jobStages.id, foreignStage));
      expect(row?.archivedAt).toBeNull();
    });
  });

  describe("listing", () => {
    it("reports effective kinds and application counts, hiding archived stages by default", async () => {
      const job = await fx.addJob();
      await fx.addApplication({ stageId: job.stages.applied!.id, jobId: job.jobId });
      await fx.addApplication({ stageId: job.stages.applied!.id, jobId: job.jobId });

      const stages = await listJobStages({ workspaceId: fx.workspaceId, jobId: job.jobId });
      expect(stages.map((stage) => stage.kind)).toEqual([
        "applied",
        "screening",
        "interview",
        "offer",
        "hired",
        "rejected",
      ]);
      expect(stages[0]?.applicationCount).toBe(2);
    });
  });
});
