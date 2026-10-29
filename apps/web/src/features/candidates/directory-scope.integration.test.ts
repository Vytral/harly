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

import {
  listCandidateDirectory,
  listCandidateDirectoryFacets,
  listCandidates,
} from "./data";

const NO_ACCESS = "You do not have permission to view candidates.";

describe.skipIf(!runPipelineIntegration)("candidate directory: permission and role scope (database)", () => {
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

  it("refuses the directory, its facets and the legacy list without candidates:view", async () => {
    actAs("plain");
    await expect(listCandidateDirectory({})).rejects.toThrow(NO_ACCESS);
    await expect(listCandidateDirectoryFacets()).rejects.toThrow(NO_ACCESS);
    await expect(listCandidates()).rejects.toThrow(NO_ACCESS);
  });

  it("shows a scoped caller only candidates with an application on an in-scope job", async () => {
    actAs("scoped");
    const page = await listCandidateDirectory({});
    const ids = page.rows.map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([fx.candidateA, fx.candidateAB]));
    expect(ids).not.toContain(fx.candidateB);
    expect(page.total).toBe(2);
  });

  it("reports only in-scope applications for a scoped caller (latest application and count)", async () => {
    actAs("scoped");
    const page = await listCandidateDirectory({});
    const shared = page.rows.find((row) => row.id === fx.candidateAB);
    expect(shared?.applicationCount).toBe(1);
    expect(shared?.latestApplication?.jobId).toBe(fx.jobA);
    expect(shared?.latestApplication?.applicationId).toBe(fx.applicationAB.onA);
  });

  it("applies scope to filters, so an out-of-scope name does not match a scoped caller", async () => {
    actAs("scoped");
    const outOfScope = await listCandidateDirectory({ query: "Zed Outside" });
    expect(outOfScope.total).toBe(0);
    const inScope = await listCandidateDirectory({ query: "Alpha" });
    expect(inScope.rows.map((row) => row.id)).toEqual([fx.candidateA]);
  });

  it("gives an unrestricted caller every candidate and every application", async () => {
    actAs("full");
    const page = await listCandidateDirectory({});
    expect(page.rows.map((row) => row.id)).toEqual(
      expect.arrayContaining([fx.candidateA, fx.candidateB, fx.candidateAB]),
    );
    expect(page.rows.find((row) => row.id === fx.candidateAB)?.applicationCount).toBe(2);
  });

  it("keeps facets inside the caller's scope and excludes archived stages", async () => {
    actAs("scoped");
    const scoped = await listCandidateDirectoryFacets();
    // Engineering (assigned job A) and Sales (assigned job E); Legal is out of scope.
    expect(scoped.departments).toEqual(["Engineering", "Sales"]);
    expect(scoped.tags).toEqual([expect.stringMatching(/^tag-a-/)]);
    expect(scoped.stages).not.toContain(fx.archivedStageName);

    actAs("full");
    const full = await listCandidateDirectoryFacets();
    expect(full.departments).toEqual(["Engineering", "Legal", "Sales"]);
    expect(full.tags.length).toBe(2);
    expect(full.stages).not.toContain(fx.archivedStageName);
  });

  it("limits the legacy candidate list to in-scope candidates and applications", async () => {
    actAs("scoped");
    const rows = await listCandidates();
    const ids = rows.map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([fx.candidateA, fx.candidateAB]));
    expect(ids).not.toContain(fx.candidateB);
    const shared = rows.find((row) => row.id === fx.candidateAB);
    expect(shared?.applicationCount).toBe(1);
    expect(shared?.latestApplication?.jobId).toBe(fx.jobA);
  });

  it("keeps every candidate and application in the legacy list for an unrestricted caller", async () => {
    actAs("full");
    const rows = await listCandidates();
    const ids = rows.map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([fx.candidateA, fx.candidateB, fx.candidateAB]));
    expect(rows.find((row) => row.id === fx.candidateAB)?.applicationCount).toBe(2);
  });

  it("never returns candidates from another workspace", async () => {
    actAs("full");
    const page = await listCandidateDirectory({});
    expect(page.rows.map((row) => row.id)).not.toContain(fx.otherWorkspaceCandidate.candidateId);
  });
});
