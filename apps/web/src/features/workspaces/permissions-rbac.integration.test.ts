import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({
  workspaceId: "",
  userId: "",
  membershipId: "",
  roleKey: "recruiter",
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: context.workspaceId },
    user: { id: context.userId, email: "rbac@example.test" },
    membership: { id: context.membershipId, role: context.roleKey },
    role: context.roleKey,
    roleKey: context.roleKey,
    session: {},
  })),
}));

const integration =
  process.env.RUN_RBAC_INTEGRATION === "1" ? describe : describe.skip;

import {
  applications,
  candidates,
  customRoles,
  db,
  jobHiringTeam,
  jobStages,
  jobs,
  member,
  organization,
  user,
} from "@harly/db";
import {
  requireApplicationPermission,
  requireJobPermission,
} from "./permissions-server";

integration("workspace isolation and role permissions", () => {
  const workspaceA = `rbac-a-${randomUUID()}`;
  const workspaceB = `rbac-b-${randomUUID()}`;
  const userA = `rbac-user-a-${randomUUID()}`;
  const userB = `rbac-user-b-${randomUUID()}`;
  let jobA: string;
  let unassignedJobA: string;
  let jobB: string;
  let applicationA: string;
  let candidateA: string;
  const scopedRoleKey = "scoped-recruiter";

  async function insertJob(workspaceId: string, createdById: string, title: string) {
    const [job] = await db
      .insert(jobs)
      .values({
        workspaceId,
        title,
        slug: `${title.toLowerCase().replaceAll(" ", "-")}-${randomUUID()}`,
        employmentType: "full_time",
        workplaceType: "remote",
        description: "RBAC integration fixture",
        status: "open",
        createdById,
      })
      .returning({ id: jobs.id });
    return job.id;
  }

  beforeAll(async () => {
    await db.insert(organization).values([
      { id: workspaceA, name: "RBAC A", slug: workspaceA, createdAt: new Date() },
      { id: workspaceB, name: "RBAC B", slug: workspaceB, createdAt: new Date() },
    ]);
    await db.insert(user).values([
      { id: userA, name: "RBAC A User", email: `${userA}@example.test`, createdAt: new Date(), updatedAt: new Date() },
      { id: userB, name: "RBAC B User", email: `${userB}@example.test`, createdAt: new Date(), updatedAt: new Date() },
    ]);
    await db.insert(customRoles).values({
      workspaceId: workspaceA,
      key: scopedRoleKey,
      name: "Scoped Recruiter",
      permissions: ["jobs:view", "candidates:view"],
      scope: { jobAccess: "assigned" },
    });
    await db.insert(member).values([
      { id: `rbac-member-a-${randomUUID()}`, organizationId: workspaceA, userId: userA, role: scopedRoleKey, createdAt: new Date(), updatedAt: new Date() },
      { id: `rbac-member-b-${randomUUID()}`, organizationId: workspaceB, userId: userB, role: "recruiter", createdAt: new Date(), updatedAt: new Date() },
    ]);

    jobA = await insertJob(workspaceA, userA, "Assigned Job");
    unassignedJobA = await insertJob(workspaceA, userA, "Unassigned Job");
    jobB = await insertJob(workspaceB, userB, "Foreign Job");
    const [stage] = await db
      .insert(jobStages)
      .values({ workspaceId: workspaceA, jobId: jobA, name: "Applied", order: 0 })
      .returning({ id: jobStages.id });
    await db.insert(jobHiringTeam).values({
      workspaceId: workspaceA,
      jobId: jobA,
      userId: userA,
      role: "recruiter",
    });
    const [candidate] = await db
      .insert(candidates)
      .values({
        workspaceId: workspaceA,
        firstName: "RBAC",
        lastName: "Candidate",
        email: `${randomUUID()}@example.test`,
      })
      .returning({ id: candidates.id });
    candidateA = candidate.id;
    const [application] = await db
      .insert(applications)
      .values({
        workspaceId: workspaceA,
        candidateId: candidate.id,
        jobId: jobA,
        currentStageId: stage.id,
      })
      .returning({ id: applications.id });
    applicationA = application.id;
  });

  afterAll(async () => {
    await db.delete(organization).where(
      and(eq(organization.id, workspaceA)),
    );
    await db.delete(organization).where(eq(organization.id, workspaceB));
    await db.delete(user).where(eq(user.id, userA));
    await db.delete(user).where(eq(user.id, userB));
  });

  it("allows assigned access but blocks unassigned and foreign workspace jobs", async () => {
    context.workspaceId = workspaceA;
    context.userId = userA;
    context.membershipId = "member-a";
    context.roleKey = scopedRoleKey;
    await expect(requireJobPermission("jobs:view", jobA)).resolves.toBeDefined();
    await expect(requireJobPermission("jobs:view", unassignedJobA)).rejects.toThrow(
      /not assigned|access/i,
    );

    context.workspaceId = workspaceB;
    context.userId = userB;
    context.roleKey = "recruiter";
    await expect(requireJobPermission("jobs:view", jobA)).rejects.toThrow(
      /not found/i,
    );
    await expect(requireJobPermission("jobs:view", jobB)).resolves.toBeDefined();
  });

  it("does not authorize an application after its candidate is soft-deleted", async () => {
    context.workspaceId = workspaceA;
    context.userId = userA;
    context.roleKey = scopedRoleKey;
    await db
      .update(candidates)
      .set({ deletedAt: new Date() })
      .where(and(eq(candidates.id, candidateA), eq(candidates.workspaceId, workspaceA)));

    await expect(
      requireApplicationPermission("candidates:view", applicationA),
    ).rejects.toThrow(/application not found/i);
  });
});
