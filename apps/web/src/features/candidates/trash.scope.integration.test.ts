import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { applications, candidates, db } from "@harly/db";

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

vi.mock("server-only", () => ({}));
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

import { listTrashedCandidates } from "./data";

describe.skipIf(!runPipelineIntegration)("trashed candidates respect candidate scope (database)", () => {
  let fx: AuthorizationFixture;
  let trashedOnA: string;
  let trashedOnB: string;
  let trashedUnlinked: string;

  function actAs(key: ActorKey) {
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users[key];
    ctx.roleKey = fx.roleKeys[key];
  }

  async function trashedCandidate(first: string, jobId: string | null, stageId: string | null) {
    const [row] = await db
      .insert(candidates)
      .values({
        workspaceId: fx.workspaceId,
        firstName: first,
        lastName: `Trash ${randomUUID().slice(0, 6)}`,
        email: `${randomUUID()}@example.test`,
        deletedAt: new Date(),
      })
      .returning({ id: candidates.id });
    if (jobId && stageId) {
      await db.insert(applications).values({
        workspaceId: fx.workspaceId,
        candidateId: row.id,
        jobId,
        currentStageId: stageId,
      });
    }
    return row.id;
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    trashedOnA = await trashedCandidate("TrashA", fx.jobA, fx.stagesA.screening!.id);
    trashedOnB = await trashedCandidate("TrashB", fx.jobB, fx.stagesB.screening!.id);
    trashedUnlinked = await trashedCandidate("TrashUnlinked", null, null);
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("lists only trashed candidates inside the caller's scope for a scoped caller", async () => {
    actAs("scoped");
    const ids = (await listTrashedCandidates()).map((row) => row.id);
    expect(ids).toContain(trashedOnA);
    expect(ids).not.toContain(trashedOnB);
    expect(ids).not.toContain(trashedUnlinked);
  });

  it("lists every trashed candidate in the workspace for an unrestricted caller", async () => {
    actAs("full");
    const ids = (await listTrashedCandidates()).map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([trashedOnA, trashedOnB, trashedUnlinked]));
  });
});
