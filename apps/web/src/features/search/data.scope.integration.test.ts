import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAuthorizationFixture,
  type ActorKey,
  type AuthorizationFixture,
} from "@/test-support/authorization-fixture";
import { runPipelineIntegration } from "@/test-support/pipeline-fixture";

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

import { searchWorkspace, workspaceSearchAccess } from "./data";

describe.skipIf(!runPipelineIntegration)("legacy workspace search enforces permission and scope (database)", () => {
  let fx: AuthorizationFixture;

  function actAs(key: ActorKey) {
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users[key];
    ctx.roleKey = fx.roleKeys[key];
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  beforeEach(() => {
    ctx.workspaceId = fx.workspaceId;
  });

  it("reports which halves of the search the caller may use", async () => {
    actAs("none");
    await expect(workspaceSearchAccess()).resolves.toEqual({ jobs: false, candidates: false });
    actAs("plain");
    await expect(workspaceSearchAccess()).resolves.toEqual({ jobs: true, candidates: false });
    actAs("scoped");
    await expect(workspaceSearchAccess()).resolves.toEqual({ jobs: true, candidates: true });
  });

  it("returns nothing for a caller with neither jobs:view nor candidates:view", async () => {
    actAs("none");
    await expect(searchWorkspace(fx.names.candidateA)).resolves.toEqual({ jobs: [], candidates: [] });
  });

  it("never returns candidates to a caller without candidates:view", async () => {
    actAs("plain");
    const results = await searchWorkspace(fx.names.candidateA);
    expect(results.candidates).toEqual([]);
  });

  it("returns only in-scope candidates to a scoped caller", async () => {
    actAs("scoped");
    const inScope = await searchWorkspace(fx.names.candidateA);
    expect(inScope.candidates.map((candidate) => candidate.id)).toEqual([fx.candidateA]);

    const outOfScope = await searchWorkspace(fx.names.candidateB);
    expect(outOfScope.candidates).toEqual([]);

    // Shared candidate: visible through the application on job A.
    const shared = await searchWorkspace(fx.names.candidateAB);
    expect(shared.candidates.map((candidate) => candidate.id)).toEqual([fx.candidateAB]);
  });

  it("returns only in-scope jobs to a scoped caller", async () => {
    actAs("scoped");
    const results = await searchWorkspace("Fixture job");
    const jobIds = results.jobs.map((job) => job.id);
    expect(jobIds).toEqual(expect.arrayContaining([fx.jobA, fx.jobAssignedEmpty]));
    expect(jobIds).not.toContain(fx.jobB);
    expect(jobIds).not.toContain(fx.jobUnassignedEmpty);
  });

  it("returns out-of-scope candidates to an unrestricted caller", async () => {
    actAs("full");
    const results = await searchWorkspace(fx.names.candidateB);
    expect(results.candidates.map((candidate) => candidate.id)).toEqual([fx.candidateB]);
  });
});
