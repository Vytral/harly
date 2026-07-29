import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceContextOrNull: vi.fn(),
  requirePermission: vi.fn(),
  createScheduledReport: vi.fn(),
  listScheduledReports: vi.fn(),
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContextOrNull: mocks.getWorkspaceContextOrNull,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/server/reports/scheduled", () => ({
  createScheduledReport: mocks.createScheduledReport,
  listScheduledReports: mocks.listScheduledReports,
}));

import { POST } from "./route";

const body = {
  name: "Weekly hiring report",
  recipients: ["ops@example.com"],
  frequency: "weekly",
  reportType: "hiring_overview",
};

describe("POST /api/reports/schedules", () => {
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
