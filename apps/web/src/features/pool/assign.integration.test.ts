import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { applicationStageHistory, applications, candidates, db } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

// Issue #113: the applications unique index is partial (`WHERE status =
// 'active'`), so an ON CONFLICT clause without the same predicate fails with
// 42P10 on every insert. This runs the real action against Postgres.

const ctx = vi.hoisted(() => ({ workspaceId: "" }));

vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: vi.fn(async () => ({
    organization: { id: ctx.workspaceId },
    user: { id: "fixture-user" },
  })),
  requireCandidatePermission: vi.fn(async () => undefined),
  requireJobPermission: vi.fn(async () => undefined),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", async () => (await import("@/test-support/intl-server-mock")).intlServerMock);

import { assignFromPoolToJobAction } from "./actions";

describe.skipIf(!runPipelineIntegration)("talent pool: assign to job (database)", () => {
  let fx: PipelineFixture;
  let candidateId: string;

  beforeAll(async () => {
    fx = await createPipelineFixture();
    ctx.workspaceId = fx.workspaceId;
    const [row] = await db
      .insert(candidates)
      .values({
        workspaceId: fx.workspaceId,
        firstName: "Pool",
        lastName: `Assign ${randomUUID().slice(0, 6)}`,
        email: `${randomUUID()}@example.test`,
      })
      .returning({ id: candidates.id });
    candidateId = row.id;
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("creates the application in the entry stage with its stage history", async () => {
    const result = await assignFromPoolToJobAction({ candidateId, jobId: fx.jobId });
    expect(result).toEqual({ success: true });

    const rows = await db
      .select({ id: applications.id, status: applications.status, stageId: applications.currentStageId })
      .from(applications)
      .where(and(eq(applications.workspaceId, fx.workspaceId), eq(applications.candidateId, candidateId)));
    expect(rows).toHaveLength(1);
    const [application] = rows;
    if (!application) throw new Error("application was not created");
    expect(application.status).toBe("active");

    const history = await db
      .select({ toStageId: applicationStageHistory.toStageId })
      .from(applicationStageHistory)
      .where(eq(applicationStageHistory.applicationId, application.id));
    expect(history).toEqual([{ toStageId: application.stageId }]);
  });

  it("reports the existing application instead of creating a second one", async () => {
    const result = await assignFromPoolToJobAction({ candidateId, jobId: fx.jobId });
    expect(result).toMatchObject({ success: false });

    const rows = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.workspaceId, fx.workspaceId), eq(applications.candidateId, candidateId)));
    expect(rows).toHaveLength(1);
  });
});
