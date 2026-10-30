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

import { buildReadTools } from "./tools";

const EXECUTION = { toolCallId: "search-scope-test", messages: [] };

describe.skipIf(!runPipelineIntegration)("Harly AI searchCandidates tool respects permission and scope (database)", () => {
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

  it("returns a not-permitted result without PII when the caller can search neither jobs nor candidates", async () => {
    actAs("none");
    // No permission filter, so the handler itself has to refuse.
    const tools = buildReadTools({ workspaceId: fx.workspaceId, userId: fx.users.none });
    const output = (await tools.searchCandidates.execute!({ query: fx.names.candidateA }, EXECUTION)) as {
      permitted: boolean;
      candidates: unknown[];
      jobs: unknown[];
    };
    expect(output.permitted).toBe(false);
    expect(output.candidates).toEqual([]);
    expect(output.jobs).toEqual([]);
    expect(JSON.stringify(output)).not.toContain(fx.names.candidateA);
  });

  it("returns only in-scope candidates to a scoped caller", async () => {
    actAs("scoped");
    const tools = buildReadTools({ workspaceId: fx.workspaceId, userId: fx.users.scoped });
    const output = (await tools.searchCandidates.execute!({ query: fx.names.candidateB }, EXECUTION)) as {
      permitted: boolean;
      candidateCount: number;
    };
    expect(output.permitted).toBe(true);
    expect(output.candidateCount).toBe(0);
  });
});
