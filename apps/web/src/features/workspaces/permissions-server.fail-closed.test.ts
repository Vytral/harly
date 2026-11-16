import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getWorkspaceContextOrNull: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", async () => (await import("@/test-support/intl-server-mock")).intlServerMock);
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn(), isNull: vi.fn() }));
vi.mock("@harly/db", () => ({
  db: { select: vi.fn() },
  applications: {}, auditLogs: {}, candidates: {}, customRoles: {}, jobs: {},
  jobHiringTeam: {}, offers: {}, interviews: {}, member: {}, user: {},
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(),
  getWorkspaceContextOrNull: mocks.getWorkspaceContextOrNull,
}));

import { getActorPermissions } from "./permissions-server";

describe("getActorPermissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("grants nothing when the session context has no resolvable role", async () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "ws-1" },
      user: { id: "user-1" },
      roleKey: undefined,
      role: undefined,
    });
    await expect(getActorPermissions("ws-1", "user-1")).resolves.toEqual([]);
  });

  it("resolves a built-in role normally", async () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "ws-1" },
      user: { id: "user-1" },
      roleKey: "owner",
    });
    const permissions = await getActorPermissions("ws-1", "user-1");
    expect(permissions.length).toBeGreaterThan(0);
  });
});
