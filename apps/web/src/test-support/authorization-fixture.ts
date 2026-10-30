import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import {
  applications,
  candidateTags,
  candidates,
  customRoles,
  db,
  interviews,
  jobHiringTeam,
  jobStages,
  jobs,
  user,
  type JobStage,
  type StageKind,
} from "@harly/db";

import type { Permission, RoleScope } from "@/features/workspaces/permissions";
import { createPipelineFixture, type PipelineFixture } from "@/test-support/pipeline-fixture";

/**
 * Synthetic workspace for authorization tests: three custom roles (a role
 * without candidates:view, a restricted role, and an unrestricted role with the
 * same permissions as the restricted one), jobs in two departments, one
 * hiring-team assignment, an archived stage, and candidates on different jobs.
 *
 * Everything is namespaced by a random id, so tests can run against a shared
 * database. `cleanup()` removes the workspace and everything cascading from it.
 */

export const RECRUITER_PERMISSIONS: Permission[] = [
  "candidates:view",
  "jobs:view",
  "jobs:approve",
  "tasks:read",
  "reports:read",
  "interviews:feedback",
];

export type ActorKey = "none" | "plain" | "scoped" | "full";

export type AuthorizationFixture = {
  workspaceId: string;
  /** Job A: Engineering, assigned to the scoped user, default pipeline. */
  jobA: string;
  /** Job B: Sales, not assigned to the scoped user. */
  jobB: string;
  /** Open job with no applications, not assigned to the scoped user (at risk). */
  jobUnassignedEmpty: string;
  /** Open job with no applications, assigned to the scoped user (at risk). */
  jobAssignedEmpty: string;
  /** Draft job in Sales awaiting approval. */
  jobDraft: string;
  stagesA: Partial<Record<StageKind, JobStage>>;
  stagesB: Partial<Record<StageKind, JobStage>>;
  archivedStageName: string;
  users: Record<ActorKey, string>;
  roleKeys: Record<ActorKey, string>;
  /** Candidate with an application only on job A. */
  candidateA: string;
  /** Candidate with an application only on job B. */
  candidateB: string;
  /** Candidate with applications on both jobs. */
  candidateAB: string;
  applicationAB: { onA: string; onB: string };
  /** Named candidates, for search and resolution tests. */
  names: { candidateA: string; candidateB: string; candidateAB: string };
  /** Create a second workspace with one candidate and return that candidate id. */
  otherWorkspaceCandidate: { workspaceId: string; candidateId: string };
  cleanup: () => Promise<void>;
};

const SCOPED: RoleScope = { jobAccess: "assigned", departments: [], regions: [] };
const UNRESTRICTED: RoleScope = { jobAccess: "all", departments: [], regions: [] };

export async function createAuthorizationFixture(): Promise<AuthorizationFixture> {
  const tag = randomUUID().slice(0, 8);
  const fx: PipelineFixture = await createPipelineFixture();
  const workspaceId = fx.workspaceId;
  const jobA = fx.jobId;
  const stagesA = fx.stages;

  const jobBFixture = await fx.addJob();
  const jobB = jobBFixture.jobId;
  const stagesB = jobBFixture.stages;
  const unassignedFixture = await fx.addJob();
  const assignedFixture = await fx.addJob();
  const draftFixture = await fx.addJob();

  await db.update(jobs).set({ department: "Engineering" }).where(eq(jobs.id, jobA));
  await db.update(jobs).set({ department: "Sales" }).where(eq(jobs.id, jobB));
  await db.update(jobs).set({ department: "Sales" }).where(eq(jobs.id, assignedFixture.jobId));
  await db.update(jobs).set({ department: "Legal" }).where(eq(jobs.id, unassignedFixture.jobId));
  await db.update(jobs).set({ status: "draft", department: "Sales" }).where(eq(jobs.id, draftFixture.jobId));

  await db.insert(jobStages).values({
    workspaceId,
    jobId: jobA,
    name: "Legacy Review",
    order: 9,
    archivedAt: new Date(),
  });

  const users = {
    none: `auth-none-${tag}`,
    plain: `auth-plain-${tag}`,
    scoped: `auth-scoped-${tag}`,
    full: `auth-full-${tag}`,
  } satisfies Record<ActorKey, string>;
  for (const [key, id] of Object.entries(users)) {
    await db.insert(user).values({
      id,
      name: `Auth ${key} ${tag}`,
      email: `${id}@example.test`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const roleKeys = {
    none: `none-${tag}`,
    plain: `plain-${tag}`,
    scoped: `scoped-${tag}`,
    full: `full-${tag}`,
  } satisfies Record<ActorKey, string>;
  await db.insert(customRoles).values([
    {
      workspaceId,
      key: roleKeys.none,
      name: "No search",
      permissions: ["tasks:read"],
      scope: UNRESTRICTED,
    },
    {
      workspaceId,
      key: roleKeys.plain,
      name: "Plain",
      permissions: ["jobs:view"],
      scope: UNRESTRICTED,
    },
    {
      workspaceId,
      key: roleKeys.scoped,
      name: "Scoped",
      permissions: RECRUITER_PERMISSIONS,
      scope: SCOPED,
    },
    {
      workspaceId,
      key: roleKeys.full,
      name: "Full",
      permissions: RECRUITER_PERMISSIONS,
      scope: UNRESTRICTED,
    },
  ]);

  await db.insert(jobHiringTeam).values([
    { workspaceId, jobId: jobA, userId: users.scoped, role: "recruiter" },
    { workspaceId, jobId: assignedFixture.jobId, userId: users.scoped, role: "recruiter" },
  ]);

  const screeningA = stagesA.screening!.id;
  const screeningB = stagesB.screening!.id;

  const candidateA = await addCandidate(workspaceId, "Alpha", "Candidate", tag);
  const candidateB = await addCandidate(workspaceId, "Zed", "Outside", tag);
  const candidateAB = await addCandidate(workspaceId, "Shared", "Person", tag);

  await addApplication(workspaceId, candidateA, jobA, screeningA);
  await addApplication(workspaceId, candidateB, jobB, screeningB);
  const onA = await addApplication(workspaceId, candidateAB, jobA, stagesA.applied!.id);
  const onB = await addApplication(workspaceId, candidateAB, jobB, screeningB);

  await db.insert(interviews).values([
    {
      workspaceId,
      applicationId: onA,
      jobId: jobA,
      candidateId: candidateAB,
      scheduledAt: new Date(),
      type: "screening",
    },
    {
      workspaceId,
      applicationId: onB,
      jobId: jobB,
      candidateId: candidateAB,
      scheduledAt: new Date(),
      type: "screening",
    },
  ]);

  await db.insert(candidateTags).values([
    { workspaceId, candidateId: candidateA, label: `tag-a-${tag}` },
    { workspaceId, candidateId: candidateB, label: `tag-b-${tag}` },
  ]);

  const other = await createPipelineFixture();
  const otherCandidate = await addCandidate(other.workspaceId, "Other", "Workspace", tag);

  return {
    workspaceId,
    jobA,
    jobB,
    jobUnassignedEmpty: unassignedFixture.jobId,
    jobAssignedEmpty: assignedFixture.jobId,
    jobDraft: draftFixture.jobId,
    stagesA,
    stagesB,
    archivedStageName: "Legacy Review",
    users,
    roleKeys,
    candidateA,
    candidateB,
    candidateAB,
    applicationAB: { onA, onB },
    names: {
      candidateA: `Alpha Candidate ${tag}`.trim(),
      candidateB: `Zed Outside ${tag}`.trim(),
      candidateAB: `Shared Person ${tag}`.trim(),
    },
    otherWorkspaceCandidate: { workspaceId: other.workspaceId, candidateId: otherCandidate },
    async cleanup() {
      await fx.cleanup();
      await other.cleanup();
      for (const id of Object.values(users)) {
        await db.delete(user).where(eq(user.id, id));
      }
    },
  };
}

async function addCandidate(workspaceId: string, firstName: string, lastName: string, tag: string) {
  const [row] = await db
    .insert(candidates)
    .values({
      workspaceId,
      firstName,
      lastName: `${lastName} ${tag}`,
      email: `${randomUUID()}@example.test`,
    })
    .returning({ id: candidates.id });
  return row.id;
}

async function addApplication(workspaceId: string, candidateId: string, jobId: string, stageId: string) {
  const [row] = await db
    .insert(applications)
    .values({ workspaceId, candidateId, jobId, currentStageId: stageId })
    .returning({ id: applications.id });
  return row.id;
}
