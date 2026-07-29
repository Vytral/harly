import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import {
  applications,
  candidates,
  db,
  jobStages,
  jobs,
  organization,
  user,
} from "@harly/db";

const localFixture = process.env.RUN_PIPELINE_LOAD_INTEGRATION === "1";
const workspaceId =
  process.env.VPS_PIPELINE_WORKSPACE_ID ??
  (localFixture ? "30000000-0000-4000-8000-000000000010" : undefined);
const jobId = "30000000-0000-4000-8000-000000000001";
const userId = "30000000-0000-4000-8000-000000000011";

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: workspaceId },
  })),
}));

import { getPipelineData } from "./data";

describe.skipIf(!localFixture && process.env.VPS_PIPELINE_LOAD !== "1")(
  "large pipeline load",
  () => {
    beforeAll(async () => {
      if (!localFixture || !workspaceId) return;

      await db.insert(organization).values({
        id: workspaceId,
        name: "Pipeline load fixture",
        slug: `pipeline-load-${workspaceId.slice(-4)}`,
        createdAt: new Date(),
      });
      await db.insert(user).values({
        id: userId,
        name: "Pipeline Load Fixture",
        email: `pipeline-load-${workspaceId.slice(-4)}@example.test`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.insert(jobs).values({
        id: jobId,
        workspaceId,
        title: "Pipeline load fixture",
        slug: "pipeline-load-fixture",
        employmentType: "full_time",
        workplaceType: "remote",
        description: "Synthetic integration fixture",
        status: "open",
        publishedAt: new Date(),
        createdById: userId,
      });
      const stageRows = await db
        .insert(jobStages)
        .values(
          ["Applied", "Screen", "Interview"].map((name, order) => ({
            workspaceId,
            jobId,
            name,
            order,
          })),
        )
        .returning({ id: jobStages.id });
      const candidatesToInsert = Array.from({ length: 300 }, (_, index) => ({
        workspaceId,
        firstName: "Load",
        lastName: `Candidate ${index}`,
        email: `pipeline-load-${index}@example.test`,
        headline: "Synthetic load fixture",
      }));
      const candidateRows = await db
        .insert(candidates)
        .values(candidatesToInsert)
        .returning({ id: candidates.id });
      await db.insert(applications).values(
        candidateRows.map((candidate, index) => ({
          workspaceId,
          candidateId: candidate.id,
          jobId,
          currentStageId: stageRows[index % stageRows.length].id,
          pipelineOrder: index,
          status: "active" as const,
        })),
      );
    });

    afterAll(async () => {
      if (!localFixture || !workspaceId) return;
      await db.delete(organization).where(
        // The organization FK cascade removes the complete fixture graph.
        eq(organization.id, workspaceId),
      );
      await db.delete(user).where(eq(user.id, userId));
    });

    it("loads the complete 300-application pipeline without cross-tenant rows", async () => {
      expect(workspaceId).toBeTruthy();

      const startedAt = performance.now();
      const result = await getPipelineData(
        jobId,
      );
      const durationMs = performance.now() - startedAt;

      expect(result.kind).toBe("ready");
      if (result.kind !== "ready") return;

      expect(result.applications).toHaveLength(300);
      expect(result.applications.every((row) => row.workspaceId === workspaceId)).toBe(
        true,
      );
      expect(result.applications.map((row) => row.pipelineOrder)).toEqual(
        Array.from({ length: 300 }, (_, index) => index),
      );
      expect(durationMs).toBeLessThan(10_000);
    });
  },
);
