import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db, offers } from "@harly/db";

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

import { listOffersForCandidate } from "./data";

describe.skipIf(!runPipelineIntegration)("candidate offers respect job scope (database)", () => {
  let fx: AuthorizationFixture;
  let offerOnA: string;
  let offerOnB: string;

  function actAs(key: ActorKey) {
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users[key];
    ctx.roleKey = fx.roleKeys[key];
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    const [a, b] = await db
      .insert(offers)
      .values([
        {
          workspaceId: fx.workspaceId,
          applicationId: fx.applicationAB.onA,
          candidateId: fx.candidateAB,
          jobId: fx.jobA,
          title: "Offer on job A",
          createdById: fx.users.full,
        },
        {
          workspaceId: fx.workspaceId,
          applicationId: fx.applicationAB.onB,
          candidateId: fx.candidateAB,
          jobId: fx.jobB,
          title: "Offer on job B",
          createdById: fx.users.full,
        },
      ])
      .returning({ id: offers.id });
    offerOnA = a!.id;
    offerOnB = b!.id;
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("returns only the candidate's offers on jobs inside the caller's scope", async () => {
    actAs("scoped");
    const ids = (await listOffersForCandidate(fx.candidateAB)).map((offer) => offer.id);
    expect(ids).toContain(offerOnA);
    expect(ids).not.toContain(offerOnB);
  });

  it("returns every offer for an unrestricted caller", async () => {
    actAs("full");
    const ids = (await listOffersForCandidate(fx.candidateAB)).map((offer) => offer.id);
    expect(ids).toEqual(expect.arrayContaining([offerOnA, offerOnB]));
  });
});
