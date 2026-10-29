import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db, scorecards } from "@harly/db";

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

import { getCandidateProfile } from "./data";

describe.skipIf(!runPipelineIntegration)("candidate profile: role scope (database)", () => {
  let fx: AuthorizationFixture;

  function actAs(key: ActorKey) {
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users[key];
    ctx.roleKey = fx.roleKeys[key];
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    // A scorecard on the out-of-scope application, and one on the in-scope one.
    await db.insert(scorecards).values([
      {
        workspaceId: fx.workspaceId,
        candidateId: fx.candidateAB,
        applicationId: fx.applicationAB.onB,
        authorId: fx.users.full,
        rating: "strong",
      },
      {
        workspaceId: fx.workspaceId,
        candidateId: fx.candidateAB,
        applicationId: fx.applicationAB.onA,
        authorId: fx.users.full,
        rating: "weak",
      },
    ]);
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("lists only the applications on in-scope jobs for a scoped caller", async () => {
    actAs("scoped");
    const profile = await getCandidateProfile(fx.candidateAB);
    expect(profile).not.toBeNull();
    expect(profile!.applications.map((application) => application.id)).toEqual([
      fx.applicationAB.onA,
    ]);
    expect(profile!.applications[0]?.jobId).toBe(fx.jobA);
  });

  it("drops scorecards that belong to out-of-scope applications for a scoped caller", async () => {
    actAs("scoped");
    const profile = await getCandidateProfile(fx.candidateAB);
    const ratings = (profile?.scorecards ?? []).map((card) => card.applicationId);
    expect(ratings).toEqual([fx.applicationAB.onA]);
  });

  it("returns no profile for a candidate with no application inside the caller's scope (fails closed)", async () => {
    actAs("scoped");
    expect(await getCandidateProfile(fx.candidateB)).toBeNull();
  });

  it("never returns a candidate from another workspace", async () => {
    actAs("full");
    expect(await getCandidateProfile(fx.otherWorkspaceCandidate.candidateId)).toBeNull();
  });

  it("keeps every application and scorecard for an unrestricted caller", async () => {
    actAs("full");
    const shared = await getCandidateProfile(fx.candidateAB);
    expect(shared!.applications.map((application) => application.id).sort()).toEqual(
      [fx.applicationAB.onA, fx.applicationAB.onB].sort(),
    );
    expect(shared!.scorecards.map((card) => card.applicationId).sort()).toEqual(
      [fx.applicationAB.onA, fx.applicationAB.onB].sort(),
    );
    const outside = await getCandidateProfile(fx.candidateB);
    expect(outside).not.toBeNull();
    expect(outside!.applications).toHaveLength(1);
  });
});
