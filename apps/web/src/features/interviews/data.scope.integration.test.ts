import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db, interviews } from "@harly/db";
import { eq } from "drizzle-orm";

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
  listCandidateInterviews,
  listInterviewsForRange,
  listUpcomingInterviews,
} from "./data";

describe.skipIf(!runPipelineIntegration)("interviews: role scope (database)", () => {
  let fx: AuthorizationFixture;
  const soon = () => new Date(Date.now() + 2 * 3_600_000);

  function actAs(key: ActorKey) {
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users[key];
    ctx.roleKey = fx.roleKeys[key];
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    // Both interviews of the shared candidate are in the future and in the same window.
    await db.update(interviews).set({ scheduledAt: soon() }).where(eq(interviews.workspaceId, fx.workspaceId));
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("shows a scoped caller only interviews for in-scope jobs in the calendar range", async () => {
    actAs("scoped");
    const start = new Date(Date.now() - 3_600_000);
    const end = new Date(Date.now() + 2 * 86_400_000);
    const rows = await listInterviewsForRange(start, end);
    expect(rows.map((row) => row.jobId)).toEqual([fx.jobA]);
    expect(rows.every((row) => row.jobId !== fx.jobB)).toBe(true);
  });

  it("shows a scoped caller only in-scope interviews among upcoming interviews", async () => {
    actAs("scoped");
    const rows = await listUpcomingInterviews();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((row) => row.jobId)).not.toContain(fx.jobB);
    expect(rows.map((row) => row.jobId)).toContain(fx.jobA);
  });

  it("shows a scoped caller only in-scope interviews on a candidate who also applied elsewhere", async () => {
    actAs("scoped");
    const rows = await listCandidateInterviews(fx.candidateAB);
    expect(rows.map((row) => row.jobTitle)).toHaveLength(1);
    expect(rows.map((row) => row.applicationId)).toEqual([fx.applicationAB.onA]);
  });

  it("keeps every interview for an unrestricted caller", async () => {
    actAs("full");
    const start = new Date(Date.now() - 3_600_000);
    const end = new Date(Date.now() + 2 * 86_400_000);
    const rows = await listInterviewsForRange(start, end);
    expect(rows.map((row) => row.jobId).sort()).toEqual([fx.jobA, fx.jobB].sort());
    expect(rows.map((row) => row.jobId)).toEqual(expect.arrayContaining([fx.jobB]));
    const upcoming = await listUpcomingInterviews();
    expect(upcoming.map((row) => row.jobId)).toEqual(expect.arrayContaining([fx.jobA, fx.jobB]));
    const candidate = await listCandidateInterviews(fx.candidateAB);
    expect(candidate).toHaveLength(2);
  });
});
