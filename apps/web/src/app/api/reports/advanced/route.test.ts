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

  const asOwner = () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue({ organization: { id: "ws-1" } });
    mocks.requirePermission.mockResolvedValue({ organization: { id: "ws-1" }, roleKey: "owner" });
    mocks.getRolePolicy.mockResolvedValue({
      permissions: [],
      scope: { jobAccess: "all", departments: [], regions: [] },
    });
    mocks.getWorkspaceTimeZone.mockResolvedValue("America/Los_Angeles");
    mocks.getAdvancedHiringAnalytics.mockResolvedValue({ stageSla: [] });
  };

  it("computes the window in the workspace time zone for a supported range", async () => {
    asOwner();

    const response = await GET(request("http://harly.test/api/reports/advanced?days=365"));

    expect(response.status).toBe(200);
    const [{ workspaceId, window }] = mocks.getAdvancedHiringAnalytics.mock.calls.at(-1)!;
    expect(workspaceId).toBe("ws-1");
    expect(window.timeZone).toBe("America/Los_Angeles");
    expect(window.days).toBe(365);
  });

  it("defaults to 90 days", async () => {
    asOwner();

    await GET(request("http://harly.test/api/reports/advanced"));

    const [{ window }] = mocks.getAdvancedHiringAnalytics.mock.calls.at(-1)!;
    expect(window.days).toBe(90);
  });

  it.each(["7", "9999", "abc", "0", ""])("rejects unsupported days=%s with 400", async (days) => {
    asOwner();
    mocks.getAdvancedHiringAnalytics.mockClear();

    const response = await GET(request(`http://harly.test/api/reports/advanced?days=${days}`));

    expect(response.status).toBe(400);
    expect(mocks.getAdvancedHiringAnalytics).not.toHaveBeenCalled();
  });
});
