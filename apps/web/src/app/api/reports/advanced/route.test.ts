import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceContextOrNull: vi.fn(),
  requirePermission: vi.fn(),
  getRolePolicy: vi.fn(),
  getWorkspaceTimeZone: vi.fn(),
  getAdvancedHiringAnalytics: vi.fn(),
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContextOrNull: mocks.getWorkspaceContextOrNull,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
  getRolePolicy: mocks.getRolePolicy,
}));
vi.mock("@/features/reports/canonical", () => ({
  getWorkspaceTimeZone: mocks.getWorkspaceTimeZone,
}));
vi.mock("@/features/reports/advanced", () => ({
  getAdvancedHiringAnalytics: mocks.getAdvancedHiringAnalytics,
}));

import { GET } from "./route";

const request = (url: string) => ({ nextUrl: new URL(url) }) as never;

describe("GET /api/reports/advanced", () => {
  it("rejects callers without a workspace context", async () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue(null);

    const response = await GET(request("http://harly.test/api/reports/advanced"));

    expect(response.status).toBe(401);
    expect(mocks.getAdvancedHiringAnalytics).not.toHaveBeenCalled();
  });

  it("checks reports:read before reading any analytics", async () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue({ organization: { id: "ws-1" } });
    mocks.requirePermission.mockRejectedValue(new Error("forbidden"));

    await expect(
      GET(request("http://harly.test/api/reports/advanced")),
    ).rejects.toThrow("forbidden");
    expect(mocks.getAdvancedHiringAnalytics).not.toHaveBeenCalled();
  });

  it("refuses roles limited to specific jobs with 403 before reading analytics", async () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue({ organization: { id: "ws-1" }, roleKey: "scoped" });
    mocks.requirePermission.mockResolvedValue({ organization: { id: "ws-1" }, roleKey: "scoped" });
    mocks.getRolePolicy.mockResolvedValue({
      permissions: ["reports:read"],
      scope: { jobAccess: "assigned", departments: [], regions: [] },
    });

    const response = await GET(request("http://harly.test/api/reports/advanced"));

    expect(response.status).toBe(403);
    expect(mocks.getAdvancedHiringAnalytics).not.toHaveBeenCalled();
  });

  it("computes the window in the workspace time zone and clamps the requested days", async () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue({ organization: { id: "ws-1" } });
    mocks.requirePermission.mockResolvedValue({ organization: { id: "ws-1" }, roleKey: "owner" });
    mocks.getRolePolicy.mockResolvedValue({
      permissions: [],
      scope: { jobAccess: "all", departments: [], regions: [] },
    });
    mocks.getWorkspaceTimeZone.mockResolvedValue("America/Los_Angeles");
    mocks.getAdvancedHiringAnalytics.mockResolvedValue({ stageSla: [] });

    const response = await GET(request("http://harly.test/api/reports/advanced?days=9999"));

    expect(response.status).toBe(200);
    const [{ workspaceId, window }] = mocks.getAdvancedHiringAnalytics.mock.calls[0];
    expect(workspaceId).toBe("ws-1");
    expect(window.timeZone).toBe("America/Los_Angeles");
    // Clamped to 730 local days.
    expect((window.to.getTime() - window.from.getTime()) / 86_400_000).toBeGreaterThan(729);
    expect((window.to.getTime() - window.from.getTime()) / 86_400_000).toBeLessThan(731);
  });
});
