import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@harly/api";

const mocks = vi.hoisted(() => ({
  requireActorPermission: vi.fn(),
  getWorkflow: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/features/workspaces/permissions-server", () => ({
  requireActorPermission: mocks.requireActorPermission,
}));

vi.mock("./data", () => ({
  getWorkflow: mocks.getWorkflow,
  createWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
}));

vi.mock("@harly/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@harly/db")>();
  return {
    ...actual,
    db: {
      ...actual.db,
      execute: mocks.execute,
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([])),
            })),
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
      insert: vi.fn(),
      update: vi.fn(),
    },
  };
});

import {
  getAutomationAiContext,
  getAutomationProposal,
  prepareAutomationProposal,
  simulateAutomationProposal,
  applyAutomationProposal,
  searchAutomationAiWorkflows,
} from "./ai-proposals";

describe("Automation AI proposals authorization boundary (Phase 0)", () => {
  it("rejects getAutomationAiContext when actor lacks automations:manage", async () => {
    mocks.requireActorPermission.mockRejectedValue(
      ApiError.forbidden("You do not have permission to perform this action."),
    );

    await expect(
      getAutomationAiContext({
        workspaceId: "ws-1",
        actorId: "user-hm",
        workflowId: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: "You do not have permission to perform this action.",
    });

    expect(mocks.requireActorPermission).toHaveBeenCalledWith(
      "ws-1",
      "user-hm",
      "automations:manage",
    );
    expect(mocks.getWorkflow).not.toHaveBeenCalled();
  });

  it("rejects prepareAutomationProposal when actor lacks automations:manage", async () => {
    mocks.requireActorPermission.mockRejectedValue(
      ApiError.forbidden("You do not have permission to perform this action."),
    );

    await expect(
      prepareAutomationProposal({
        workspaceId: "ws-1",
        actorId: "user-hm",
        name: "Test workflow",
        graph: {
          schemaVersion: 2,
          entryNodeId: "t1",
          nodes: [{ id: "t1", type: "trigger", event: "application.created" }],
          edges: [],
        },
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: "You do not have permission to perform this action.",
    });

    expect(mocks.requireActorPermission).toHaveBeenCalledWith(
      "ws-1",
      "user-hm",
      "automations:manage",
    );
  });

  it("reports a missing proposal migration before attempting a write", async () => {
    mocks.requireActorPermission.mockResolvedValue(undefined);
    mocks.execute.mockResolvedValue([{ relation: null }]);

    await expect(
      prepareAutomationProposal({
        workspaceId: "ws-1",
        actorId: "user-owner",
        name: "Test workflow",
        graph: {
          schemaVersion: 2,
          entryNodeId: "t1",
          nodes: [{ id: "t1", type: "trigger", event: "application.created" }],
          edges: [],
        },
      }),
    ).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining("database migration is missing"),
    });

    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("reports a partial proposal migration before attempting a write", async () => {
    mocks.execute.mockClear();
    mocks.requireActorPermission.mockResolvedValue(undefined);
    mocks.execute.mockResolvedValue([
      {
        relation: "automation_ai_proposals",
        columns: ["validation_issues", "simulation", "status", "expires_at"],
      },
    ]);

    await expect(
      prepareAutomationProposal({
        workspaceId: "ws-1",
        actorId: "user-owner",
        name: "Test workflow",
        graph: {
          schemaVersion: 2,
          entryNodeId: "t1",
          nodes: [{ id: "t1", type: "trigger", event: "application.created" }],
          edges: [],
        },
      }),
    ).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining("missing columns: diff"),
    });

    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("rejects getAutomationProposal when actor lacks automations:manage", async () => {
    mocks.requireActorPermission.mockRejectedValue(
      ApiError.forbidden("You do not have permission to perform this action."),
    );

    await expect(
      getAutomationProposal({
        workspaceId: "ws-1",
        actorId: "user-hm",
        proposalId: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: "You do not have permission to perform this action.",
    });
  });

  it("rejects simulateAutomationProposal when actor lacks automations:manage", async () => {
    mocks.requireActorPermission.mockRejectedValue(
      ApiError.forbidden("You do not have permission to perform this action."),
    );

    await expect(
      simulateAutomationProposal({
        workspaceId: "ws-1",
        actorId: "user-hm",
        proposalId: "22222222-2222-4222-8222-222222222222",
        trigger: {},
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: "You do not have permission to perform this action.",
    });
  });

  it("rejects applyAutomationProposal when actor lacks automations:manage", async () => {
    mocks.requireActorPermission.mockRejectedValue(
      ApiError.forbidden("You do not have permission to perform this action."),
    );

    await expect(
      applyAutomationProposal({
        workspaceId: "ws-1",
        actorId: "user-hm",
        proposalId: "22222222-2222-4222-8222-222222222222",
        actionId: "act-1",
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: "You do not have permission to perform this action.",
    });
  });

  it("rejects searchAutomationAiWorkflows when actorId is provided and lacks automations:manage", async () => {
    mocks.requireActorPermission.mockRejectedValue(
      ApiError.forbidden("You do not have permission to perform this action."),
    );

    await expect(
      searchAutomationAiWorkflows({
        workspaceId: "ws-1",
        actorId: "user-hm",
        query: "offer",
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: "You do not have permission to perform this action.",
    });
  });
});
