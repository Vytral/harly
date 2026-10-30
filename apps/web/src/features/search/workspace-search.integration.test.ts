import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import {
  applications,
  candidates,
  db,
  jobHiringTeam,
  jobs,
  member as authMembers,
  tasks,
  user as authUsers,
} from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";
import type { Permission, RoleScope } from "@/features/workspaces/permissions";

import type { WorkspaceSearchActor } from "./scope";
import type { WorkspaceSearchResults } from "./results";
import { searchWorkspaceForActor, visibleRecentRefsForActor } from "./workspace-search";
import { matchRank, normalizeSearchQuery } from "./query";

const EVERYTHING: Permission[] = [
  "jobs:view",
  "candidates:view",
  "tasks:read",
  "members:read",
];
const OPEN_SCOPE: RoleScope = { jobAccess: "all", departments: [], regions: [] };

function hitIds(results: WorkspaceSearchResults, group: keyof WorkspaceSearchResults["groups"]) {
  return (results.groups[group]?.hits ?? []).map((hit) => hit.id);
}

function hrefs(results: WorkspaceSearchResults, group: keyof WorkspaceSearchResults["groups"]) {
  return (results.groups[group]?.hits ?? []).map((hit) => hit.href);
}

describe.skipIf(!runPipelineIntegration)("workspace search (database)", () => {
  let fx: PipelineFixture;
  let otherFx: PipelineFixture;
  const tag = randomUUID().slice(0, 8);
  const scopedUserId = `search-scoped-${tag}`;
  const patUserId = `search-pat-${tag}`;

  const ids: Record<string, string> = {};

  async function insertJob(input: {
    title: string;
    department?: string | null;
    region?: string | null;
    deleted?: boolean;
    workspaceId?: string;
    userId?: string;
  }) {
    const id = randomUUID();
    await db.insert(jobs).values({
      id,
      workspaceId: input.workspaceId ?? fx.workspaceId,
      title: input.title,
      slug: `search-${id.slice(0, 8)}`,
      department: input.department ?? null,
      jobLocationRegion: input.region ?? null,
      employmentType: "full_time",
      workplaceType: "remote",
      description: "Synthetic search fixture",
      status: "open",
      publishedAt: new Date(),
      createdById: input.userId ?? fx.userId,
      deletedAt: input.deleted ? new Date() : null,
    });
    return id;
  }

  async function insertCandidate(input: {
    firstName: string;
    lastName: string;
    email: string;
    headline?: string | null;
    anonymized?: boolean;
    deleted?: boolean;
    workspaceId?: string;
  }) {
    const [row] = await db
      .insert(candidates)
      .values({
        workspaceId: input.workspaceId ?? fx.workspaceId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        headline: input.headline ?? null,
        anonymizedAt: input.anonymized ? new Date() : null,
        deletedAt: input.deleted ? new Date() : null,
      })
      .returning({ id: candidates.id });
    return row.id;
  }

  async function applyTo(candidateId: string, jobId: string, stageId: string, workspaceId = fx.workspaceId) {
    await db.insert(applications).values({
      workspaceId,
      candidateId,
      jobId,
      currentStageId: stageId,
    });
  }

  function actor(
    overrides: Partial<WorkspaceSearchActor> = {},
  ): WorkspaceSearchActor {
    return {
      workspaceId: fx.workspaceId,
      userId: fx.userId,
      permissions: EVERYTHING,
      scope: OPEN_SCOPE,
      ...overrides,
    };
  }

  beforeAll(async () => {
    fx = await createPipelineFixture();
    otherFx = await createPipelineFixture();
    const stage = fx.stages.applied!.id;

    // Jobs: A (Engineering, EMEA), B (Sales, APAC), C (Engineering, APAC).
    await db
      .update(jobs)
      .set({ title: "Staff Engineer Platform", department: "Engineering", jobLocationRegion: "EMEA" })
      .where(eq(jobs.id, fx.jobId));
    ids.jobA = fx.jobId;
    const second = await fx.addJob();
    ids.jobB = second.jobId;
    await db
      .update(jobs)
      .set({ title: "Account Executive", department: "Sales", jobLocationRegion: "APAC" })
      .where(eq(jobs.id, ids.jobB));
    const secondStage = second.stages.applied!.id;
    ids.jobC = await insertJob({ title: "Engineering Manager Berlin", department: "Engineering", region: "APAC" });
    ids.jobTrashed = await insertJob({ title: "Engineering trashed role", department: "Engineering", deleted: true });

    // Candidates.
    ids.ada = await insertCandidate({ firstName: "Ada", lastName: "Lovelace", email: `ada-${tag}@example.test`, headline: "Analytical engines" });
    await applyTo(ids.ada, ids.jobA, stage);
    ids.grace = await insertCandidate({ firstName: "Grace", lastName: "Hopper", email: `grace-${tag}@example.test` });
    await applyTo(ids.grace, ids.jobB, secondStage);
    ids.linus = await insertCandidate({ firstName: "Linus", lastName: "Torvalds", email: `linus-${tag}@example.test` });
    await applyTo(ids.linus, ids.jobC, stage);
    // Matches "ada" but has no application, so scoped roles must never see it.
    ids.adaByron = await insertCandidate({ firstName: "Ada", lastName: "Byron", email: `byron-${tag}@example.test` });
    ids.adaAnonymized = await insertCandidate({ firstName: "Ada", lastName: "Redacted", email: `redacted-${tag}@example.test`, anonymized: true });
    await applyTo(ids.adaAnonymized, ids.jobA, stage);
    ids.adaDeleted = await insertCandidate({ firstName: "Ada", lastName: "Gone", email: `gone-${tag}@example.test`, deleted: true });

    // Tasks: one linked to Ada (visible to scope through her application), one unlinked.
    await db.insert(tasks).values([
      { workspaceId: fx.workspaceId, title: "Call Ada about offer", ownerId: fx.userId, createdById: fx.userId, candidateId: ids.ada, status: "pending" },
      { workspaceId: fx.workspaceId, title: "Budget review", ownerId: fx.userId, createdById: fx.userId, status: "pending" },
    ]);

    // Users: a scoped recruiter who is assigned to job B, and a member for the people group.
    await db.insert(authUsers).values([
      { id: scopedUserId, name: "Scoped Recruiter", email: `scoped-${tag}@example.test`, createdAt: new Date(), updatedAt: new Date() },
      { id: patUserId, name: "Pat Member", email: `pat-${tag}@example.test`, createdAt: new Date(), updatedAt: new Date() },
    ]);
    await db.insert(authMembers).values({
      id: `member-${tag}`,
      organizationId: fx.workspaceId,
      userId: patUserId,
      role: "recruiter",
      createdAt: new Date(),
      status: "active",
    });
    await db.insert(jobHiringTeam).values({
      workspaceId: fx.workspaceId,
      jobId: ids.jobB,
      userId: scopedUserId,
      role: "recruiter",
    });
    await db.insert(tasks).values({
      workspaceId: fx.workspaceId,
      title: "Scoped follow-up",
      ownerId: scopedUserId,
      createdById: scopedUserId,
      status: "pending",
    });

    // Other workspace: same names, must never leak into this workspace's results.
    const otherStage = otherFx.stages.applied!.id;
    const otherAda = await insertCandidate({
      firstName: "Ada",
      lastName: "Lovelace",
      email: `ada-other-${tag}@example.test`,
      workspaceId: otherFx.workspaceId,
    });
    await applyTo(otherAda, otherFx.jobId, otherStage, otherFx.workspaceId);
    ids.otherAda = otherAda;
  });

  afterAll(async () => {
    await fx?.cleanup();
    await otherFx?.cleanup();
    await db.delete(authMembers).where(eq(authMembers.userId, patUserId));
    await db.delete(authUsers).where(inArray(authUsers.id, [scopedUserId, patUserId]));
  });

  it("returns every permitted group for an unrestricted actor", async () => {
    const results = await searchWorkspaceForActor(actor(), "ada");

    expect(hitIds(results, "candidates").sort()).toEqual(
      [ids.ada, ids.adaByron].sort(),
    );
    expect(hrefs(results, "applications")).toEqual([`/dashboard/candidates/${ids.ada}`]);
    expect(results.groups.tasks?.hits.map((hit) => hit.primary)).toContain(
      "Call Ada about offer",
    );
    expect(results.allResultsHref).toBe("/dashboard/candidates?q=ada");
  });

  it("omits candidate and application groups without candidates:view and never leaks PII", async () => {
    const results = await searchWorkspaceForActor(
      actor({ permissions: ["jobs:view", "tasks:read", "members:read"] }),
      "lovelace",
    );

    expect(results.groups.candidates).toBeUndefined();
    expect(results.groups.applications).toBeUndefined();
    expect(results.allResultsHref).toBeNull();
    expect(JSON.stringify(results.groups)).not.toMatch(/lovelace|ada-|@example/i);
  });

  it("returns only jobs for a jobs-only caller", async () => {
    const results = await searchWorkspaceForActor(
      actor({ permissions: ["jobs:view"] }),
      "engineer",
    );
    expect(Object.keys(results.groups)).toEqual(["jobs"]);
    expect(results.groups.jobs?.hits.map((hit) => hit.id).sort()).toEqual(
      [ids.jobA, ids.jobC].sort(),
    );
  });

  it("returns nothing when the caller holds no search permission", async () => {
    const results = await searchWorkspaceForActor(actor({ permissions: [] }), "ada");
    expect(results.groups).toEqual({});
    expect(results.allResultsHref).toBeNull();
  });

  it("limits a department-scoped role to in-scope jobs and candidates", async () => {
    const scope: RoleScope = { ...OPEN_SCOPE, departments: ["Engineering"] };
    const deptActor = actor({ userId: scopedUserId, scope });

    const engineers = await searchWorkspaceForActor(deptActor, "engineer");
    expect(hitIds(engineers, "jobs").sort()).toEqual([ids.jobA, ids.jobC].sort());

    const accounts = await searchWorkspaceForActor(deptActor, "account");
    expect(hitIds(accounts, "jobs")).toEqual([]);

    const ada = await searchWorkspaceForActor(deptActor, "ada");
    expect(hitIds(ada, "candidates")).toEqual([ids.ada]);
    expect(hrefs(ada, "applications")).toEqual([`/dashboard/candidates/${ids.ada}`]);
    expect(JSON.stringify(ada)).not.toContain(`ada-other-${tag}`);

    const grace = await searchWorkspaceForActor(deptActor, "grace");
    expect(hitIds(grace, "candidates")).toEqual([]);
    expect(hitIds(grace, "applications")).toEqual([]);
  });

  it("applies region as an additional restriction", async () => {
    const scope: RoleScope = {
      ...OPEN_SCOPE,
      departments: ["Engineering"],
      regions: ["EMEA"],
    };
    const regionActor = actor({ userId: scopedUserId, scope });

    const engineers = await searchWorkspaceForActor(regionActor, "engineer");
    expect(hitIds(engineers, "jobs")).toEqual([ids.jobA]);

    const linus = await searchWorkspaceForActor(regionActor, "linus");
    expect(hitIds(linus, "candidates")).toEqual([]);
  });

  it("shows assigned-only roles just the jobs they are on the hiring team for", async () => {
    const scope: RoleScope = { ...OPEN_SCOPE, jobAccess: "assigned" };
    const assigned = actor({ userId: scopedUserId, scope });

    const accounts = await searchWorkspaceForActor(assigned, "account");
    expect(hitIds(accounts, "jobs")).toEqual([ids.jobB]);

    const engineers = await searchWorkspaceForActor(assigned, "engineer");
    expect(hitIds(engineers, "jobs")).toEqual([]);

    const grace = await searchWorkspaceForActor(assigned, "grace");
    expect(hitIds(grace, "candidates")).toEqual([ids.grace]);
  });

  it("keeps unlinked tasks owned by others out of a scoped role's results", async () => {
    const scope: RoleScope = { ...OPEN_SCOPE, departments: ["Engineering"] };
    const scoped = actor({ userId: scopedUserId, scope });

    const budget = await searchWorkspaceForActor(scoped, "budget");
    expect(hitIds(budget, "tasks")).toEqual([]);

    const followUp = await searchWorkspaceForActor(scoped, "scoped follow");
    expect(hitIds(followUp, "tasks")).toHaveLength(1);

    const call = await searchWorkspaceForActor(scoped, "call ada");
    expect(hitIds(call, "tasks")).toHaveLength(1);

    const unrestricted = await searchWorkspaceForActor(actor(), "budget");
    expect(hitIds(unrestricted, "tasks")).toHaveLength(1);
  });

  it("hides a task linked to an out-of-scope application even when its candidate has an in-scope application", async () => {
    // Jane applies to two jobs: an Engineering role (in scope) and a Sales role
    // in Berlin (out of scope). Tasks are created for each combination of links.
    const token = `xs${tag}`;
    const berlin = await fx.addJob();
    await db
      .update(jobs)
      .set({ title: `Berlin Sales ${token}`, department: "Sales", jobLocationRegion: "EMEA" })
      .where(eq(jobs.id, berlin.jobId));
    const jane = await insertCandidate({
      firstName: "Jane",
      lastName: `Scope${tag}`,
      email: `jane-${tag}@example.test`,
    });
    const [inScopeApp] = await db
      .insert(applications)
      .values({ workspaceId: fx.workspaceId, candidateId: jane, jobId: fx.jobId, currentStageId: fx.stages.applied!.id })
      .returning({ id: applications.id });
    const [outOfScopeApp] = await db
      .insert(applications)
      .values({ workspaceId: fx.workspaceId, candidateId: jane, jobId: berlin.jobId, currentStageId: berlin.stages.applied!.id })
      .returning({ id: applications.id });

    const [linkedOutOfScope, candidateOnly, jobOutOfScope, mixed, linkedInScope] = await db
      .insert(tasks)
      .values([
        // Linked to the out-of-scope application: hidden.
        { workspaceId: fx.workspaceId, title: `Send offer ${token}`, ownerId: fx.userId, createdById: fx.userId, candidateId: jane, applicationId: outOfScopeApp.id, status: "pending" },
        // Candidate only, no application or job link: visible through the in-scope application.
        { workspaceId: fx.workspaceId, title: `Jane intro ${token}`, ownerId: fx.userId, createdById: fx.userId, candidateId: jane, status: "pending" },
        // Linked to the out-of-scope job: hidden even though the candidate has an in-scope application.
        { workspaceId: fx.workspaceId, title: `Berlin job task ${token}`, ownerId: fx.userId, createdById: fx.userId, candidateId: jane, jobId: berlin.jobId, status: "pending" },
        // In-scope job but out-of-scope application: hidden, the application link must be in scope.
        { workspaceId: fx.workspaceId, title: `Mixed links ${token}`, ownerId: fx.userId, createdById: fx.userId, candidateId: jane, jobId: fx.jobId, applicationId: outOfScopeApp.id, status: "pending" },
        // Linked to the in-scope application: visible.
        { workspaceId: fx.workspaceId, title: `In scope app ${token}`, ownerId: fx.userId, createdById: fx.userId, candidateId: jane, applicationId: inScopeApp.id, status: "pending" },
      ])
      .returning({ id: tasks.id });

    const scoped = actor({
      userId: scopedUserId,
      scope: { ...OPEN_SCOPE, departments: ["Engineering"] },
    });
    const visible = await searchWorkspaceForActor(scoped, token, { limitPerGroup: 12 });
    expect(hitIds(visible, "tasks").sort()).toEqual(
      [candidateOnly.id, linkedInScope.id].sort(),
    );
    expect(JSON.stringify(visible)).not.toContain(linkedOutOfScope.id);
    expect(JSON.stringify(visible)).not.toContain(jobOutOfScope.id);
    expect(JSON.stringify(visible)).not.toContain(mixed.id);

    const everything = await searchWorkspaceForActor(actor(), token, { limitPerGroup: 12 });
    expect(hitIds(everything, "tasks")).toHaveLength(5);
  });

  it("re-checks saved recents against the viewer's current access", async () => {
    const [ownTask] = await db
      .insert(tasks)
      .values({
        workspaceId: fx.workspaceId,
        title: "Recent check task",
        ownerId: scopedUserId,
        createdById: scopedUserId,
        status: "pending",
      })
      .returning({ id: tasks.id });
    const [adaApplication] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.candidateId, ids.ada));
    const [graceApplication] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.candidateId, ids.grace));
    const refs = [
      { group: "jobs" as const, id: ids.jobA },
      { group: "jobs" as const, id: ids.jobB },
      { group: "jobs" as const, id: ids.jobTrashed },
      { group: "candidates" as const, id: ids.ada },
      { group: "candidates" as const, id: ids.grace },
      { group: "applications" as const, id: adaApplication.id },
      { group: "applications" as const, id: graceApplication.id },
      { group: "tasks" as const, id: ownTask.id },
      { group: "people" as const, id: patUserId },
      { group: "candidates" as const, id: "not-a-uuid" },
    ];
    const key = (ref: { group: string; id: string }) => `${ref.group}:${ref.id}`;

    const engineering = actor({
      userId: scopedUserId,
      scope: { ...OPEN_SCOPE, departments: ["Engineering"] },
    });
    const visibleToEngineering = await visibleRecentRefsForActor(engineering, refs);
    expect(visibleToEngineering.map(key).sort()).toEqual(
      [
        `jobs:${ids.jobA}`,
        `candidates:${ids.ada}`,
        `applications:${adaApplication.id}`,
        `tasks:${ownTask.id}`,
        `people:${patUserId}`,
      ].sort(),
    );

    const unrestricted = await visibleRecentRefsForActor(actor(), refs);
    expect(unrestricted.map(key)).toEqual(
      expect.arrayContaining([
        `jobs:${ids.jobB}`,
        `candidates:${ids.grace}`,
        `applications:${graceApplication.id}`,
      ]),
    );
    expect(unrestricted.map(key)).not.toContain(`jobs:${ids.jobTrashed}`);
    expect(unrestricted.map(key)).not.toContain("candidates:not-a-uuid");

    const withoutCandidates = await visibleRecentRefsForActor(
      actor({ permissions: ["jobs:view", "tasks:read", "members:read"] }),
      refs,
    );
    expect(withoutCandidates.map((ref) => ref.group)).not.toContain("candidates");
    expect(withoutCandidates.map((ref) => ref.group)).not.toContain("applications");
  });

  it("never returns anonymized, deleted or trashed rows", async () => {
    const results = await searchWorkspaceForActor(actor(), "ada");
    const all = JSON.stringify(results);
    expect(all).not.toContain(ids.adaAnonymized);
    expect(all).not.toContain(ids.adaDeleted);

    const trashed = await searchWorkspaceForActor(actor(), "trashed");
    expect(hitIds(trashed, "jobs")).toEqual([]);
  });

  it("isolates workspaces", async () => {
    const results = await searchWorkspaceForActor(actor(), "lovelace");
    expect(hitIds(results, "candidates")).not.toContain(ids.otherAda);

    const otherActor = actor({
      workspaceId: otherFx.workspaceId,
      userId: otherFx.userId,
    });
    const otherResults = await searchWorkspaceForActor(otherActor, "lovelace");
    expect(hitIds(otherResults, "candidates")).toEqual([ids.otherAda]);
    expect(JSON.stringify(otherResults)).not.toContain(ids.ada);
  });

  it("finds members by name for members:read holders only", async () => {
    const results = await searchWorkspaceForActor(actor(), "pat member");
    expect(results.groups.people?.hits.map((hit) => hit.primary)).toEqual([
      "Pat Member",
    ]);
    expect(JSON.stringify(results)).not.toContain(`pat-${tag}@example.test`);

    const withoutMembers = await searchWorkspaceForActor(
      actor({ permissions: ["jobs:view"] }),
      "pat member",
    );
    expect(withoutMembers.groups.people).toBeUndefined();
  });

  it("ranks an exact email ahead of prefix and substring matches", async () => {
    const exactEmail = `ada-${tag}@example.test`;
    const prefixCandidate = await insertCandidate({
      firstName: "Prefix",
      lastName: "Match",
      email: `${exactEmail}.au`,
    });

    const results = await searchWorkspaceForActor(actor(), exactEmail);
    const ranked = hitIds(results, "candidates");
    expect(ranked[0]).toBe(ids.ada);
    expect(ranked.indexOf(prefixCandidate)).toBeGreaterThan(0);

    // The SQL ordering must agree with the reference rank for every returned row.
    const query = normalizeSearchQuery(exactEmail)!;
    const emailByCandidate = new Map([
      [ids.ada, exactEmail],
      [prefixCandidate, `${exactEmail}.au`],
    ]);
    const tiers = ranked.map((id) =>
      matchRank(query, [emailByCandidate.get(id)], [emailByCandidate.get(id)]),
    );
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
  });

  it("caps each group at the limit and reports hasMore exactly", async () => {
    const probes = await Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        insertJob({ title: `Limit probe ${tag} ${i}` }),
      ),
    );
    expect(probes).toHaveLength(7);

    const first = await searchWorkspaceForActor(actor(), `limit probe ${tag}`, {
      limitPerGroup: 6,
    });
    expect(first.groups.jobs?.hits).toHaveLength(6);
    expect(first.groups.jobs?.hasMore).toBe(true);
    expect(first.groups.jobs?.seeAllHref).toBe("/dashboard/jobs");

    const exact = await searchWorkspaceForActor(actor(), `limit probe ${tag}`, {
      limitPerGroup: 7,
    });
    expect(exact.groups.jobs?.hits).toHaveLength(7);
    expect(exact.groups.jobs?.hasMore).toBe(false);

    const clamped = await searchWorkspaceForActor(actor(), `limit probe ${tag}`, {
      limitPerGroup: 1000,
    });
    expect(clamped.groups.jobs?.hits).toHaveLength(7);
  });

  it("treats LIKE metacharacters in the query as literal text", async () => {
    const percentJob = await insertJob({ title: `Remote 100% ${tag}` });
    const plainJob = await insertJob({ title: `Plain ${tag}` });
    const underscoreJob = await insertJob({ title: `Under_score ${tag}` });
    const wordJob = await insertJob({ title: `Underscore ${tag}` });

    // "0%" must match only a literal percent sign, not any run of characters.
    const percent = await searchWorkspaceForActor(actor(), "0%", { limitPerGroup: 12 });
    expect(hitIds(percent, "jobs")).toContain(percentJob);
    expect(hitIds(percent, "jobs")).not.toContain(plainJob);

    // "r_" must match a literal underscore; the wildcard reading would also match "rs".
    const underscore = await searchWorkspaceForActor(actor(), "r_", { limitPerGroup: 12 });
    expect(hitIds(underscore, "jobs")).toContain(underscoreJob);
    expect(hitIds(underscore, "jobs")).not.toContain(wordJob);
  });

  it("answers a one-character query with no results", async () => {
    const results = await searchWorkspaceForActor(actor(), "%");
    expect(results.groups).toEqual({});
    expect(results.allResultsHref).toBeNull();
  });

  it("returns a result set without throwing for a restricted actor", async () => {
    const scoped = actor({
      userId: scopedUserId,
      scope: { ...OPEN_SCOPE, departments: ["Engineering"] },
    });
    await expect(searchWorkspaceForActor(scoped, "ada")).resolves.toMatchObject({
      query: "ada",
    });
  });
});
