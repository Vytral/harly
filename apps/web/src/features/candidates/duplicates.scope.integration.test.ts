import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createAuthorizationFixture,
  type ActorKey,
  type AuthorizationFixture,
} from "@/test-support/authorization-fixture";
import { runPipelineIntegration } from "@/test-support/pipeline-fixture";

const ctx = vi.hoisted(() => ({ workspaceId: "", userId: "", roleKey: "owner" }));

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

import { findSuspectDuplicates } from "./data";

describe.skipIf(!runPipelineIntegration)("suspect duplicates: role scope (database)", () => {
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

  it("does not show candidates outside a restricted caller's scope", async () => {
    // "Zed Outside" only has an application on the out-of-scope job.
    actAs("scoped");
    expect(await findSuspectDuplicates(fx.candidateA, "Zed", "Nomatch", fx.workspaceId)).toEqual([]);
    const inScope = await findSuspectDuplicates(fx.candidateA, "Shared", "Nomatch", fx.workspaceId);
    expect(inScope.map((row) => row.candidateId)).toEqual([fx.candidateAB]);
  });

  it("keeps the match for an unrestricted caller", async () => {
    actAs("full");
    const rows = await findSuspectDuplicates(fx.candidateA, "Zed", "Nomatch", fx.workspaceId);
    expect(rows.map((row) => row.candidateId)).toEqual([fx.candidateB]);
  });

  it("treats % and _ in names literally", async () => {
    actAs("full");
    expect(await findSuspectDuplicates(fx.candidateA, "%", "_", fx.workspaceId)).toEqual([]);
    expect(await findSuspectDuplicates(fx.candidateA, "Z_d", "Nomatch", fx.workspaceId)).toEqual([]);
  });
});
