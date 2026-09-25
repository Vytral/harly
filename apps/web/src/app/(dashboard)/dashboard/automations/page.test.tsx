import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { isDemoMode, requirePagePermission, listWorkflows, getWorkspaceAutomationPolicy, listPendingWorkflowApprovals, serializeWorkflow } = vi.hoisted(() => ({
  isDemoMode: vi.fn(),
  requirePagePermission: vi.fn(),
  listWorkflows: vi.fn(),
  getWorkspaceAutomationPolicy: vi.fn(),
  listPendingWorkflowApprovals: vi.fn(),
  serializeWorkflow: vi.fn((value: unknown) => value),
}));

vi.mock("@harly/config", () => ({
  isDemoMode,
  loadHarlyConfig: () => ({ HARLY_URL: "https://ci.example.invalid" }),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({ requirePagePermission }));
vi.mock("@/features/automations/data", () => ({
  listWorkflows,
  getWorkspaceAutomationPolicy,
  listPendingWorkflowApprovals,
  serializeWorkflow,
}));
vi.mock("@/features/automations/AutomationsManager", () => ({
  AutomationsManager: () => null,
}));

import AutomationsPage from "./page";
import { AutomationsDemo } from "@/features/automations/AutomationsDemo";

describe("Automations page demo branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows fixed display-only examples without reading the shared workspace", async () => {
    isDemoMode.mockReturnValue(true);
    const page = await AutomationsPage();

    expect((page as ReactElement).type).toBe(AutomationsDemo);
    expect(requirePagePermission).not.toHaveBeenCalled();
    expect(listWorkflows).not.toHaveBeenCalled();
    expect(getWorkspaceAutomationPolicy).not.toHaveBeenCalled();
    expect(listPendingWorkflowApprovals).not.toHaveBeenCalled();

    const markup = renderToStaticMarkup(page);
    expect(markup).toContain("EXAMPLE 01");
    expect(markup).toContain("EXAMPLE 02");
    expect(markup).toContain("EXAMPLE 03");
    expect(markup).toContain("Safe simulation, no workflow execution");
    expect(markup).toContain("does not run either one");
    expect(markup).toContain("Self-host Harly");
    expect(markup).not.toContain("Start from scratch");
    expect(markup).not.toContain("Publish");
  });

  it("keeps the normal manager and data loading when demo mode is off", async () => {
    isDemoMode.mockReturnValue(false);
    requirePagePermission.mockResolvedValue({
      organization: { id: "workspace-1" },
      user: { id: "user-1" },
    });
    listWorkflows.mockResolvedValue([]);
    getWorkspaceAutomationPolicy.mockResolvedValue({
      enabled: true,
      maxRunsPerMinute: 300,
      maxExternalActionsPerMinute: 150,
      maxConcurrentRuns: 20,
      pausedAt: null,
      pausedById: null,
      pauseReason: null,
    });
    listPendingWorkflowApprovals.mockResolvedValue([]);

    const page = await AutomationsPage();

    expect(requirePagePermission).toHaveBeenCalledWith("automations:manage");
    expect(listWorkflows).toHaveBeenCalledWith("workspace-1");
    expect(getWorkspaceAutomationPolicy).toHaveBeenCalledWith("workspace-1");
    expect(listPendingWorkflowApprovals).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      actorId: "user-1",
    });
    expect((page as ReactElement).type).not.toBe(AutomationsDemo);
  });
});
