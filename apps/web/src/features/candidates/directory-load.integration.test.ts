import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { applications, candidates, db, jobStages, jobs, organization, user } from "@harly/db";

const enabled = process.env.RUN_DIRECTORY_LOAD_INTEGRATION === "1";
const workspaceId = "40000000-0000-4000-8000-000000000010";
const userId = "40000000-0000-4000-8000-000000000011";
const jobId = "40000000-0000-4000-8000-000000000001";

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({ organization: { id: workspaceId } })),
}));

import { listCandidateDirectory } from "./data";

describe.skipIf(!enabled)("candidate directory large workspace load", () => {
  beforeAll(async () => {
    await db.delete(organization).where(eq(organization.id, workspaceId));
    await db.insert(organization).values({
      id: workspaceId,
      name: "Directory load fixture",
      slug: "directory-load-fixture",
      createdAt: new Date(),
    });
    await db.insert(user).values({
      id: userId,
      name: "Directory Load Fixture",
      email: "directory-load-fixture@example.test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(jobs).values({
      id: jobId,
      workspaceId,
      title: "Directory load fixture",
      slug: "directory-load-fixture",
      employmentType: "full_time",
      workplaceType: "remote",
      description: "Synthetic integration fixture",
      status: "open",
      publishedAt: new Date(),
      createdById: userId,
    });
    const [stage] = await db
      .insert(jobStages)
      .values({ workspaceId, jobId, name: "Applied", order: 0 })
      .returning({ id: jobStages.id });
    const rows = await db
      .insert(candidates)
      .values(
        Array.from({ length: 1_000 }, (_, index) => ({
          workspaceId,
          firstName: "Directory",
          lastName: `Candidate ${index}`,
          email: `directory-load-${index}@example.test`,
          location: index % 2 === 0 ? "Santiago" : "Remote",
        })),
      )
      .returning({ id: candidates.id });
    await db.insert(applications).values(
      rows.map((candidate, index) => ({
        workspaceId,
        candidateId: candidate.id,
        jobId,
        currentStageId: stage.id,
        pipelineOrder: index,
      })),
    );
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, workspaceId));
    await db.delete(user).where(eq(user.id, userId));
  });

  it("keeps filters, counts and pages bounded and consistent", async () => {
    const startedAt = performance.now();
    const result = await listCandidateDirectory({
      query: "Santiago",
      page: 2,
      pageSize: 50,
      sort: "recent",
    });
    const durationMs = performance.now() - startedAt;

    expect(result.total).toBe(500);
    expect(result.rows).toHaveLength(50);
    expect(result.page).toBe(2);
    expect(result.hasNextPage).toBe(true);
    expect(result.rows.every((row) => row.location === "Santiago")).toBe(true);
    expect(result.rows.every((row) => row.latestApplication?.jobId === jobId)).toBe(true);
    expect(durationMs).toBeLessThan(10_000);
  });
});
