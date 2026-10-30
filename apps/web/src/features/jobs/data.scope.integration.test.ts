import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { customRoles, db, jobs } from "@harly/db";

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

import {
  getDashboardJob,
  listDashboardJobs,
  listJobOptions,
  listJobsWithStats,
  listTrashedJobs,
  listWorkspaceDepartments,
} from "./data";

describe.skipIf(!runPipelineIntegration)("job lists: role scope (database)", () => {
  let fx: AuthorizationFixture;

  async function roleWith(scope: RoleScope) {
    const key = `jobs-${randomUUID().slice(0, 8)}`;
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
    await db.update(jobs).set({ jobLocationRegion: "EMEA" }).where(eq(jobs.id, fx.jobB));
    // Trash one in-scope and one out-of-scope job for the trash list.
    await db.update(jobs).set({ deletedAt: new Date() }).where(eq(jobs.id, fx.jobA));
    await db.update(jobs).set({ deletedAt: new Date() }).where(eq(jobs.id, fx.jobB));
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("lists only in-scope jobs with their applicant stats for an assigned caller", async () => {
    actAs(fx.roleKeys.scoped);
    const rows = await listJobsWithStats();
    const ids = rows.map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([fx.jobAssignedEmpty]));
    expect(ids).not.toContain(fx.jobB);
    expect(ids).not.toContain(fx.jobUnassignedEmpty);
    expect(ids).not.toContain(fx.jobDraft);
  });

  it("limits the job picker to in-scope jobs for a department-scoped caller", async () => {
    const roleKey = await roleWith({ jobAccess: "all", departments: ["Legal"], regions: [] });
    actAs(roleKey, fx.users.full);
    const rows = await listJobOptions();
    expect(rows.map((row) => row.id)).toEqual([fx.jobUnassignedEmpty]);
  });

  it("limits the dashboard job list to in-scope jobs for a region-scoped caller", async () => {
    // Region is set on job B only; job B is deleted in beforeAll, so use the live jobs.
    await db.update(jobs).set({ deletedAt: null }).where(eq(jobs.id, fx.jobB));
    try {
      const roleKey = await roleWith({ jobAccess: "all", departments: [], regions: ["emea"] });
      actAs(roleKey, fx.users.full);
      const rows = await listDashboardJobs();
      expect(rows.map((row) => row.id)).toEqual([fx.jobB]);
    } finally {
      await db.update(jobs).set({ deletedAt: new Date() }).where(eq(jobs.id, fx.jobB));
    }
  });

  it("offers only departments of in-scope jobs in the department picker", async () => {
    // Trashed jobs still count here, as before: Engineering is trashed but in scope.
    actAs(fx.roleKeys.scoped);
    expect(await listWorkspaceDepartments()).toEqual(["Engineering", "Sales"]);
    actAs(fx.roleKeys.full);
    expect(await listWorkspaceDepartments()).toEqual(["Engineering", "Legal", "Sales"]);
  });

  it("lists only in-scope trashed jobs", async () => {
    actAs(fx.roleKeys.scoped);
    const rows = await listTrashedJobs();
    expect(rows.map((row) => row.id)).toEqual([fx.jobA]);
  });

  it("returns no job detail for a job outside the caller's scope", async () => {
    actAs(fx.roleKeys.scoped);
    expect(await getDashboardJob(fx.jobUnassignedEmpty)).toBeNull();
    const detail = await getDashboardJob(fx.jobAssignedEmpty);
    expect(detail).not.toBeNull();
    // The detail page builds public links from the workspace slug.
    expect(detail?.workspace.slug).toBeTruthy();
  });

  it("never returns another workspace's job or its lists", async () => {
    const other = await createPipelineFixture();
    try {
      actAs(fx.roleKeys.full);
      expect(await getDashboardJob(other.jobId)).toBeNull();
      expect((await listJobsWithStats()).map((row) => row.id)).not.toContain(other.jobId);
      expect((await listJobOptions()).map((row) => row.id)).not.toContain(other.jobId);
    } finally {
      await other.cleanup();
    }
  });

  it("keeps every live job and trashed job for an unrestricted caller", async () => {
    actAs(fx.roleKeys.full);
    const live = await listJobsWithStats();
    expect(live.map((row) => row.id)).toEqual(
      expect.arrayContaining([fx.jobUnassignedEmpty, fx.jobAssignedEmpty, fx.jobDraft]),
    );
    expect(live.map((row) => row.id)).not.toContain(fx.jobA);
    const trashed = await listTrashedJobs();
    expect(trashed.map((row) => row.id).sort()).toEqual([fx.jobA, fx.jobB].sort());
    expect(await getDashboardJob(fx.jobB)).toBeNull();
    expect(await getDashboardJob(fx.jobUnassignedEmpty)).not.toBeNull();
  });
});
