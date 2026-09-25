import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const mocks = vi.hoisted(() => ({
  isDemoMode: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  requirePagePermission: vi.fn(),
  getBuilderData: vi.fn(),
  getWorkflow: vi.fn(),
  serializeWorkflow: vi.fn((value: unknown) => value),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock("@harly/config", () => ({ isDemoMode: mocks.isDemoMode }));
vi.mock("@/features/automations/builder-data", () => ({
  getBuilderData: mocks.getBuilderData,
}));
vi.mock("@/features/automations/data", () => ({
  getWorkflow: mocks.getWorkflow,
  serializeWorkflow: mocks.serializeWorkflow,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePagePermission: mocks.requirePagePermission,
}));
vi.mock("@/features/automations/builder/WorkflowBuilder", () => ({
  WorkflowBuilder: () => null,
}));

import WorkflowBuilderRoute from "./page";
import { WorkflowBuilder } from "@/features/automations/builder/WorkflowBuilder";

describe("automation builder route in demo mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["new", "existing-workflow-id"])(
    "redirects direct route %s to the guided showcase before reading workspace data",
    async (id) => {
      mocks.isDemoMode.mockReturnValue(true);

      await expect(
        WorkflowBuilderRoute({ params: Promise.resolve({ id }) }),
      ).rejects.toThrow("redirect:/dashboard/automations");

      expect(mocks.redirect).toHaveBeenCalledWith("/dashboard/automations");
      expect(mocks.requirePagePermission).not.toHaveBeenCalled();
      expect(mocks.getBuilderData).not.toHaveBeenCalled();
      expect(mocks.getWorkflow).not.toHaveBeenCalled();
    },
  );

  it("preserves the normal new-workflow builder path", async () => {
    mocks.isDemoMode.mockReturnValue(false);
    mocks.requirePagePermission.mockResolvedValue({
      organization: { id: "workspace-1" },
    });
    mocks.getBuilderData.mockResolvedValue({ jobs: [] });

    const page = await WorkflowBuilderRoute({
      params: Promise.resolve({ id: "new" }),
    });

    expect(mocks.requirePagePermission).toHaveBeenCalledWith("automations:manage");
    expect(mocks.getBuilderData).toHaveBeenCalledWith(undefined);
    expect((page as ReactElement).type).toBe(WorkflowBuilder);
    expect((page as ReactElement<{ isNew: boolean }>).props.isNew).toBe(true);
  });
});
