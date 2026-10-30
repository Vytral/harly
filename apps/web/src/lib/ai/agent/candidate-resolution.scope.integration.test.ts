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

import { resolveCandidateReference } from "./candidate-resolution";

describe.skipIf(!runPipelineIntegration)("Harly AI candidate resolution respects scope (database)", () => {
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

  it("does not resolve a candidate the caller cannot see", async () => {
    actAs("scoped");
    await expect(resolveCandidateReference(fx.names.candidateB)).resolves.toMatchObject({
      status: "not_found",
    });
  });

  it("does not resolve any candidate for a caller without candidates:view", async () => {
    actAs("none");
    await expect(resolveCandidateReference(fx.names.candidateA)).resolves.toMatchObject({
      status: "not_found",
    });
    actAs("plain");
    await expect(resolveCandidateReference(fx.names.candidateA)).resolves.toMatchObject({
      status: "not_found",
    });
  });

  it("lists only applications on in-scope jobs for a visible candidate", async () => {
    actAs("scoped");
    const result = await resolveCandidateReference(fx.names.candidateAB);
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.candidate.id).toBe(fx.candidateAB);
    expect(result.applications.map((application) => application.jobId)).toEqual([fx.jobA]);
  });

  it("lists every application for an unrestricted caller", async () => {
    actAs("full");
    const result = await resolveCandidateReference(fx.names.candidateAB);
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.applications.map((application) => application.jobId).sort()).toEqual(
      [fx.jobA, fx.jobB].sort(),
    );
  });
});
