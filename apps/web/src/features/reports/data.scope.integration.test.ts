import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

import { getAdvancedHiringAnalytics } from "./advanced";
import { ReportsScopeError } from "./scope";
import { getReportsData, loadReportsData } from "./data";
import { normalizeReportRange } from "./ranges";

const SCOPED_ACTOR = { scope: { jobAccess: "assigned" as const, departments: [], regions: [] } };
const UNRESTRICTED_ACTOR = { scope: { jobAccess: "all" as const, departments: [], regions: [] } };

describe.skipIf(!runPipelineIntegration)("reports data: role scope (database)", () => {
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

  it("getReportsData refuses a caller whose role is limited to specific jobs", async () => {
    actAs("scoped");
    await expect(getReportsData(30)).rejects.toBeInstanceOf(ReportsScopeError);
  });

  it("loadReportsData refuses a restricted actor before reading any metric", async () => {
    await expect(
      loadReportsData({
        workspaceId: fx.workspaceId,
        days: normalizeReportRange(30),
        actor: SCOPED_ACTOR,
      }),
    ).rejects.toBeInstanceOf(ReportsScopeError);
  });

  it("getAdvancedHiringAnalytics refuses a restricted actor", async () => {
    const window = {
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-02-01T00:00:00.000Z"),
      timeZone: "UTC",
      days: null,
    };
    await expect(
      getAdvancedHiringAnalytics({ workspaceId: fx.workspaceId, window, actor: SCOPED_ACTOR }),
    ).rejects.toBeInstanceOf(ReportsScopeError);
  });

  it("still serves the full report to an unrestricted role", async () => {
    actAs("full");
    const data = await getReportsData(30);
    expect(data.range.days).toBe(30);
    const direct = await loadReportsData({
      workspaceId: fx.workspaceId,
      days: 30,
      actor: UNRESTRICTED_ACTOR,
    });
    expect(direct.summary.openRoles).toBeGreaterThan(0);
  });
});
