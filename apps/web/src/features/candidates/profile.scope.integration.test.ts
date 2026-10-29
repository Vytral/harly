import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { activityEvents, candidateReferrals, db, scorecards } from "@harly/db";

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
  const linked = {
    referralToB: "",
    referralToA: "",
    activityOnB: "",
    activityOnA: "",
    activityUnlinked: "",
  };

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

    // Referrals: one for each job, and one with no job.
    await db.insert(candidateReferrals).values([
      { workspaceId: fx.workspaceId, candidateId: fx.candidateAB, jobId: fx.jobB, referredById: fx.users.full, createdById: fx.users.full, note: "Out of scope" },
      { workspaceId: fx.workspaceId, candidateId: fx.candidateAB, jobId: fx.jobA, referredById: fx.users.full, createdById: fx.users.full, note: "In scope" },
      { workspaceId: fx.workspaceId, candidateId: fx.candidateAB, jobId: null, referredById: fx.users.full, createdById: fx.users.full, note: "No job" },
    ]);

    // Candidate-level activity that names an application or job in its metadata.
    const events = await db
      .insert(activityEvents)
      .values([
        { workspaceId: fx.workspaceId, actorId: fx.users.full, entityType: "candidate", entityId: fx.candidateAB, type: "referral.added", metadata: { jobId: fx.jobB } },
        { workspaceId: fx.workspaceId, actorId: fx.users.full, entityType: "candidate", entityId: fx.candidateAB, type: "referral.added", metadata: { jobId: fx.jobA } },
        { workspaceId: fx.workspaceId, actorId: fx.users.full, entityType: "candidate", entityId: fx.candidateAB, type: "document.requested", metadata: { applicationId: fx.applicationAB.onB, titles: ["Passport"] } },
        { workspaceId: fx.workspaceId, actorId: fx.users.full, entityType: "candidate", entityId: fx.candidateAB, type: "document.submitted", metadata: { applicationId: fx.applicationAB.onA, title: "CV" } },
        { workspaceId: fx.workspaceId, actorId: fx.users.full, entityType: "candidate", entityId: fx.candidateAB, type: "note.added", metadata: { preview: "Unlinked" } },
      ])
      .returning({ id: activityEvents.id, type: activityEvents.type, metadata: activityEvents.metadata });
    linked.referralToB = events[0]!.id;
    linked.referralToA = events[1]!.id;
    linked.activityOnB = events[2]!.id;
    linked.activityOnA = events[3]!.id;
    linked.activityUnlinked = events[4]!.id;
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
  it("hides referrals to out-of-scope jobs and keeps in-scope and unlinked referrals", async () => {
    actAs("scoped");
    const profile = await getCandidateProfile(fx.candidateAB);
    const notes = (profile?.referrals ?? []).map((referral) => referral.note).sort();
    expect(notes).toEqual(["In scope", "No job"]);
  });

  it("keeps every referral for an unrestricted caller", async () => {
    actAs("full");
    const profile = await getCandidateProfile(fx.candidateAB);
    expect((profile?.referrals ?? []).map((referral) => referral.note).sort()).toEqual(
      ["In scope", "No job", "Out of scope"],
    );
  });

  it("hides activity linked to out-of-scope jobs or applications and keeps the rest", async () => {
    actAs("scoped");
    const profile = await getCandidateProfile(fx.candidateAB);
    const ids = (profile?.activity ?? []).map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([linked.referralToA, linked.activityOnA, linked.activityUnlinked]));
    expect(ids).not.toContain(linked.referralToB);
    expect(ids).not.toContain(linked.activityOnB);
  });

  it("keeps all candidate activity for an unrestricted caller", async () => {
    actAs("full");
    const profile = await getCandidateProfile(fx.candidateAB);
    const ids = (profile?.activity ?? []).map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining([linked.referralToA, linked.referralToB, linked.activityOnA, linked.activityOnB, linked.activityUnlinked]),
    );
  });
});
