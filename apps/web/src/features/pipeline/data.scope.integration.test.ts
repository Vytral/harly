import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { customRoles, db, jobs } from "@harly/db";
import { eq } from "drizzle-orm";

import {
  createAuthorizationFixture,
  RECRUITER_PERMISSIONS,
  type AuthorizationFixture,
} from "@/test-support/authorization-fixture";
import { createPipelineFixture, runPipelineIntegration } from "@/test-support/pipeline-fixture";
import type { RoleScope } from "@/features/workspaces/permissions";

const ctx = vi.hoisted(() => ({
  workspaceId: "",
  userId: "",
  roleKey: "owner",
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: ctx.workspaceId, name: "Auth", slug: "auth" },
    user: { id: ctx.userId, email: "auth@example.test", name: "Auth User", image: null },
    membership: { id: "member", role: ctx.roleKey },
    role: ctx.roleKey,
    roleKey: ctx.roleKey,
    session: {},
  })),
  getWorkspaceContextOrNull: vi.fn(async () => null),
}));

import { getNextStage, getPipelineData, getPipelineSummary } from "./data";

describe.skipIf(!runPipelineIntegration)("pipeline board: role scope (database)", () => {
  let fx: AuthorizationFixture;

  /** Create a custom role with the recruiter permissions and the given scope. */
  async function roleWith(scope: RoleScope) {
    const key = `pipe-${randomUUID().slice(0, 8)}`;
    await db.insert(customRoles).values({
      workspaceId: fx.workspaceId,
      key,
      name: key,
      permissions: RECRUITER_PERMISSIONS,
      scope,
    });
    return key;
  }

  function actAs(roleKey: string, userId = fx.users.scoped) {
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = userId;
    ctx.roleKey = roleKey;
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    // Region on job B only, so a region-scoped role sees exactly one job.
    await db.update(jobs).set({ jobLocationRegion: "EMEA" }).where(eq(jobs.id, fx.jobB));
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("lists only in-scope jobs in the picker for an assigned caller", async () => {
    actAs(fx.roleKeys.scoped);
    const data = await getPipelineData(undefined);
    expect(data.kind).toBe("ready");
    if (data.kind !== "ready") return;
    const ids = data.jobs.map((job) => job.id);
    expect(ids).toEqual(expect.arrayContaining([fx.jobA, fx.jobAssignedEmpty]));
    expect(ids).not.toContain(fx.jobB);
    expect(ids).not.toContain(fx.jobUnassignedEmpty);
    expect(ids).not.toContain(fx.jobDraft);
  });

  it("does not open an out-of-scope job when it is requested by id", async () => {
    actAs(fx.roleKeys.scoped);
    const data = await getPipelineData(fx.jobB);
    expect(data.kind).toBe("ready");
    if (data.kind !== "ready") return;
    expect(data.selectedJob.id).not.toBe(fx.jobB);
    expect(data.applications.some((app) => app.jobId === fx.jobB)).toBe(false);
    expect(data.applications.some((app) => app.candidateId === fx.candidateB)).toBe(false);
  });

  it("shows the in-scope job's applications to an assigned caller", async () => {
    actAs(fx.roleKeys.scoped);
    const data = await getPipelineData(fx.jobA);
    expect(data.kind).toBe("ready");
    if (data.kind !== "ready") return;
    expect(data.selectedJob.id).toBe(fx.jobA);
    const candidateIds = data.applications.map((app) => app.candidateId);
    expect(candidateIds).toEqual(expect.arrayContaining([fx.candidateA, fx.candidateAB]));
  });

  it("returns an empty board when no job is inside the caller's scope (fails closed)", async () => {
    const roleKey = await roleWith({ jobAccess: "all", departments: ["Nowhere"], regions: [] });
    actAs(roleKey, fx.users.full);
    const data = await getPipelineData(undefined);
    expect(data).toEqual({ kind: "empty", jobs: [] });
  });

  it("limits a department-scoped caller to jobs in that department", async () => {
    const roleKey = await roleWith({ jobAccess: "all", departments: ["sales"], regions: [] });
    actAs(roleKey, fx.users.full);
    const data = await getPipelineData(undefined);
    expect(data.kind).toBe("ready");
    if (data.kind !== "ready") return;
    const ids = data.jobs.map((job) => job.id);
    expect(ids).toEqual(
      expect.arrayContaining([fx.jobB, fx.jobAssignedEmpty, fx.jobDraft]),
    );
    expect(ids).not.toContain(fx.jobA);
    expect(ids).not.toContain(fx.jobUnassignedEmpty);
  });

  it("limits a region-scoped caller to jobs in that region", async () => {
    const roleKey = await roleWith({ jobAccess: "all", departments: [], regions: ["emea"] });
    actAs(roleKey, fx.users.full);
    const data = await getPipelineData(undefined);
    expect(data.kind).toBe("ready");
    if (data.kind !== "ready") return;
    expect(data.jobs.map((job) => job.id)).toEqual([fx.jobB]);
  });

  it("hides stage and summary data for a job outside the caller's scope", async () => {
    actAs(fx.roleKeys.scoped);
    expect(await getNextStage(fx.jobB, fx.stagesB.screening!.id)).toBeNull();
    expect(await getPipelineSummary(fx.jobB)).toBeNull();
  });

  it("never opens another workspace's pipeline", async () => {
    const other = await createPipelineFixture();
    try {
      actAs(fx.roleKeys.full);
      const data = await getPipelineData(other.jobId);
      expect(data.kind).toBe("ready");
      if (data.kind !== "ready") return;
      expect(data.jobs.map((job) => job.id)).not.toContain(other.jobId);
      expect(data.selectedJob.id).not.toBe(other.jobId);
    } finally {
      await other.cleanup();
    }
  });

  it("keeps the full pipeline for an unrestricted caller", async () => {
    actAs(fx.roleKeys.full);
    const data = await getPipelineData(fx.jobB);
    expect(data.kind).toBe("ready");
    if (data.kind !== "ready") return;
    expect(data.jobs.map((job) => job.id)).toEqual(
      expect.arrayContaining([fx.jobA, fx.jobB, fx.jobUnassignedEmpty, fx.jobAssignedEmpty, fx.jobDraft]),
    );
    expect(data.selectedJob.id).toBe(fx.jobB);
    expect(data.applications.map((app) => app.candidateId)).toEqual(
      expect.arrayContaining([fx.candidateB, fx.candidateAB]),
    );
    expect(await getNextStage(fx.jobB, fx.stagesB.screening!.id)).not.toBeNull();
    expect((await getPipelineSummary(fx.jobB))?.totalActive).toBeGreaterThan(0);
  });
});
