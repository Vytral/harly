import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceContextOrNull: vi.fn(),
  requirePermission: vi.fn(),
  getRolePolicy: vi.fn(),
  createScheduledReport: vi.fn(),
  listScheduledReports: vi.fn(),
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContextOrNull: mocks.getWorkspaceContextOrNull,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
  getRolePolicy: mocks.getRolePolicy,
}));
vi.mock("@/server/reports/scheduled", () => ({
  createScheduledReport: mocks.createScheduledReport,
  listScheduledReports: mocks.listScheduledReports,
}));

import { GET, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

const body = {
  name: "Weekly hiring report",
  recipients: ["ops@example.com"],
  frequency: "weekly",
  reportType: "hiring_overview",
};

const UNRESTRICTED = { jobAccess: "all", departments: [], regions: [] };
const SCOPED = { jobAccess: "assigned", departments: [], regions: [] };

describe("GET /api/reports/schedules", () => {
  it("does not list schedules to a role limited to specific jobs", async () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "ws-1" },
      roleKey: "recruiter",
      user: { id: "user-1" },
    });
    mocks.requirePermission.mockResolvedValue({ organization: { id: "ws-1" }, roleKey: "recruiter" });
    mocks.getRolePolicy.mockResolvedValue({ permissions: ["reports:read"], scope: SCOPED });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.listScheduledReports).not.toHaveBeenCalled();
  });

  it("lists schedules for an unrestricted reports reader", async () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "ws-1" },
      roleKey: "analyst",
      user: { id: "user-1" },
    });
    mocks.requirePermission.mockResolvedValue({ organization: { id: "ws-1" }, roleKey: "analyst" });
    mocks.getRolePolicy.mockResolvedValue({ permissions: ["reports:read"], scope: UNRESTRICTED });
    mocks.listScheduledReports.mockResolvedValue([{ id: "report-1", recipients: [] }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.listScheduledReports).toHaveBeenCalledWith("ws-1");
  });
});

describe("POST /api/reports/schedules", () => {
  it("refuses to create a schedule for an admin whose role is limited to specific jobs", async () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "ws-1" },
      roleKey: "admin",
      user: { id: "user-1" },
    });
    mocks.requirePermission.mockResolvedValue({ organization: { id: "ws-1" }, roleKey: "admin" });
    mocks.getRolePolicy.mockResolvedValue({ permissions: ["reports:read"], scope: SCOPED });

    const response = await POST(
      new Request("http://harly.test/api/reports/schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }) as never,
    );

    expect(response.status).toBe(403);
    expect(mocks.createScheduledReport).not.toHaveBeenCalled();
  });

  it("keeps read-only report users from creating outbound scheduled reports", async () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "ws-1" },
      roleKey: "recruiter",
      user: { id: "user-1" },
    });
    mocks.requirePermission.mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://harly.test/api/reports/schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }) as never,
    );

    expect(response.status).toBe(403);
    expect(mocks.createScheduledReport).not.toHaveBeenCalled();
  });

  it("allows an admin to create a scheduled report", async () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "ws-1" },
      roleKey: "admin",
      user: { id: "user-1" },
    });
    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.getRolePolicy.mockResolvedValue({ permissions: ["reports:read"], scope: UNRESTRICTED });
    mocks.createScheduledReport.mockResolvedValue({ id: "report-1", ...body });

    const response = await POST(
      new Request("http://harly.test/api/reports/schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }) as never,
    );

    expect(response.status).toBe(201);
    expect(mocks.createScheduledReport).toHaveBeenCalledWith({
      ...body,
      workspaceId: "ws-1",
      createdById: "user-1",
    });
  });
});
