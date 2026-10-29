import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { candidates, db, poolEntries } from "@harly/db";

import {
  createAuthorizationFixture,
  type ActorKey,
  type AuthorizationFixture,
} from "@/test-support/authorization-fixture";
import { createPipelineFixture, runPipelineIntegration } from "@/test-support/pipeline-fixture";

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

import { getPoolStats, isCandidateInPool, listOpenJobs, listPoolCandidates } from "./data";

describe.skipIf(!runPipelineIntegration)("talent pool: role scope (database)", () => {
  let fx: AuthorizationFixture;
  let poolOnlyOnScopedJob: string;
  let poolOnlyUnlinked: string;

  function actAs(key: ActorKey) {
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users[key];
    ctx.roleKey = fx.roleKeys[key];
  }

  async function addCandidate(first: string) {
    const [row] = await db
      .insert(candidates)
      .values({
        workspaceId: fx.workspaceId,
        firstName: first,
        lastName: `Pool ${randomUUID().slice(0, 6)}`,
        email: `${randomUUID()}@example.test`,
      })
      .returning({ id: candidates.id });
    return row.id;
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    poolOnlyOnScopedJob = await addCandidate("PoolScoped");
    poolOnlyUnlinked = await addCandidate("PoolUnlinked");
    // Five active entries. Visible to the scoped caller: candidateA (linked
    // through job A), the in-scope pool job entry, and candidateAB (applied to
    // job A). Hidden: candidateB and the unlinked entry.
    await db.insert(poolEntries).values([
      { workspaceId: fx.workspaceId, candidateId: fx.candidateA, jobId: null, addedById: fx.users.full, source: "applied" },
      { workspaceId: fx.workspaceId, candidateId: fx.candidateB, jobId: fx.jobB, addedById: fx.users.full, source: "applied" },
      { workspaceId: fx.workspaceId, candidateId: poolOnlyOnScopedJob, jobId: fx.jobAssignedEmpty, addedById: fx.users.full, source: "sourced" },
      { workspaceId: fx.workspaceId, candidateId: poolOnlyUnlinked, jobId: null, addedById: fx.users.full, source: "sourced" },
      { workspaceId: fx.workspaceId, candidateId: fx.candidateAB, jobId: fx.jobB, addedById: fx.users.full, source: "applied" },
    ]);
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("lists only pool candidates linked to an in-scope job or application for a scoped caller", async () => {
    actAs("scoped");
    const rows = await listPoolCandidates();
    const ids = rows.map((row) => row.candidateId);
    expect(ids).toEqual(
      expect.arrayContaining([fx.candidateA, poolOnlyOnScopedJob, fx.candidateAB]),
    );
    expect(ids).not.toContain(fx.candidateB);
    expect(ids).not.toContain(poolOnlyUnlinked);
    expect(rows).toHaveLength(3);
  });

  it("applies the scope to the pool search filter (out-of-scope names do not match)", async () => {
    actAs("scoped");
    const rows = await listPoolCandidates({ search: "Zed" });
    expect(rows).toEqual([]);
  });

  it("hides pool membership and stats outside the caller's scope", async () => {
    actAs("scoped");
    expect(await isCandidateInPool(fx.candidateB)).toEqual({ inPool: false });
    expect(await isCandidateInPool(poolOnlyUnlinked)).toEqual({ inPool: false });
    expect(await isCandidateInPool(fx.candidateA)).toMatchObject({ inPool: true });
    const stats = await getPoolStats();
    expect(stats.total).toBe(3);
  });

  it("lists only open jobs inside the caller's scope in the pool job picker", async () => {
    actAs("scoped");
    const ids = (await listOpenJobs()).map((job) => job.id);
    expect(ids).toEqual(expect.arrayContaining([fx.jobA, fx.jobAssignedEmpty]));
    expect(ids).not.toContain(fx.jobB);
    expect(ids).not.toContain(fx.jobUnassignedEmpty);
  });

  it("never lists pool entries from another workspace", async () => {
    const other = await createPipelineFixture();
    try {
      const [row] = await db
        .insert(candidates)
        .values({ workspaceId: other.workspaceId, firstName: "Other", lastName: "Pool", email: `${randomUUID()}@example.test` })
        .returning({ id: candidates.id });
      await db.insert(poolEntries).values({ workspaceId: other.workspaceId, candidateId: row.id, addedById: fx.users.full, source: "applied" });
      actAs("full");
      const ids = (await listPoolCandidates()).map((entry) => entry.candidateId);
      expect(ids).not.toContain(row.id);
      expect((await getPoolStats()).total).toBe(5);
    } finally {
      await other.cleanup();
    }
  });

  it("keeps every pool entry, stat and open job for an unrestricted caller", async () => {
    actAs("full");
    const rows = await listPoolCandidates();
    expect(rows.map((row) => row.candidateId)).toEqual(
      expect.arrayContaining([fx.candidateA, fx.candidateB, poolOnlyOnScopedJob, poolOnlyUnlinked, fx.candidateAB]),
    );
    expect(rows).toHaveLength(5);
    expect(await isCandidateInPool(fx.candidateB)).toMatchObject({ inPool: true });
    expect((await getPoolStats()).total).toBe(5);
    const ids = (await listOpenJobs()).map((job) => job.id);
    expect(ids).toEqual(expect.arrayContaining([fx.jobB, fx.jobUnassignedEmpty, fx.jobAssignedEmpty]));
  });
});
