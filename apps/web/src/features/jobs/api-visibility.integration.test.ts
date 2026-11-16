import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { candidates, db, jobs } from "@harly/db";

import { createApplicationForApi } from "@/features/applications/service";
import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { getJobForApi, listJobsForApi } from "./service";

vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: vi.fn(async () => undefined),
}));

describe.skipIf(!runPipelineIntegration)(
  "publishable key job visibility",
  () => {
    let fx: PipelineFixture;
    let draftId: string;
    let closedId: string;
    let candidateId: string;

    beforeAll(async () => {
      fx = await createPipelineFixture();
      draftId = (await fx.addJob()).jobId;
      closedId = (await fx.addJob()).jobId;
      await db.update(jobs).set({ status: "draft" }).where(eq(jobs.id, draftId));
      await db
        .update(jobs)
        .set({ status: "closed" })
        .where(eq(jobs.id, closedId));
      const [candidate] = await db
        .insert(candidates)
        .values({
          workspaceId: fx.workspaceId,
          firstName: "Visibility",
          lastName: "Candidate",
          email: `visibility-${fx.workspaceId}@example.test`,
        })
        .returning({ id: candidates.id });
      candidateId = candidate.id;
    });
    afterAll(async () => {
      await fx?.cleanup();
    });

    it("lists only public jobs when publicOnly is set", async () => {
      const publicRows = await listJobsForApi({
        workspaceId: fx.workspaceId,
        publicOnly: true,
        cursor: null,
        limit: 50,
      });
      expect(publicRows.map((job) => job.id)).toEqual([fx.jobId]);

      const allRows = await listJobsForApi({
        workspaceId: fx.workspaceId,
        cursor: null,
        limit: 50,
      });
      expect(allRows.map((job) => job.id).sort()).toEqual(
        [fx.jobId, draftId, closedId].sort(),
      );
    });

    it("hides draft and closed jobs from a publishable get", async () => {
      await expect(
        getJobForApi({ workspaceId: fx.workspaceId, jobId: draftId, publicOnly: true }),
      ).rejects.toThrow("Job not found.");
      await expect(
        getJobForApi({ workspaceId: fx.workspaceId, jobId: closedId, publicOnly: true }),
      ).rejects.toThrow("Job not found.");
      await expect(
        getJobForApi({ workspaceId: fx.workspaceId, jobId: draftId }),
      ).resolves.toMatchObject({ id: draftId });
    });

    it("refuses a publishable application to a non-open job", async () => {
      await expect(
        createApplicationForApi({
          workspaceId: fx.workspaceId,
          jobId: closedId,
          candidateId,
          requirePublicJob: true,
        }),
      ).rejects.toThrow("Job not found.");
      await expect(
        createApplicationForApi({
          workspaceId: fx.workspaceId,
          jobId: fx.jobId,
          candidateId,
          requirePublicJob: true,
        }),
      ).resolves.toMatchObject({ jobId: fx.jobId });
    });
  },
);
