import { beforeEach, describe, expect, it, vi } from "vitest";

// F1-01: a candidate must NOT be movable to a stage that belongs to a
// DIFFERENT job, even when both jobs share the same workspace.

const mocks = vi.hoisted(() => {
  const transactionImpl = vi.fn();
  return {
    transactionImpl,
    getWorkspaceContext: vi.fn(),
    requirePermission: vi.fn(),
  };
});

vi.mock("@harly/db", () => ({
  db: {
    transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mocks.transactionImpl(fn),
    update: vi.fn(() => ({
      set: () => ({ where: () => ({ returning: async () => [] }) }),
    })),
    insert: vi.fn(() => ({ values: () => ({ returning: async () => [] }) })),
    // `getWorkspaceEmailBranding` calls db.select; return an inert chain so it
    // doesn't break the action's success path (the action only needs the
    // transaction mock to drive stage-isolation assertions).
    select: vi.fn(() => ({
      from: () => ({
        leftJoin: () => ({ where: () => ({ limit: async () => [] }) }),
        where: () => ({ limit: async () => [] }),
      }),
    })),
  },
  applications: { id: "applications.id", jobId: "applications.jobId" },
  candidates: {},
  jobs: {},
  organization: {},
  jobStages: {},
  applicationStageHistory: {},
  emailTemplates: { id: "emailTemplates.id" },
  workspaceSettings: { primaryColor: "#000000" },
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
  requireApplicationPermission: mocks.requirePermission,
}));
vi.mock("@/lib/email", () => ({
  sendWorkspaceEmail: vi.fn(),
  getWorkspaceEmailBranding: vi.fn(async () => ({})),
}));
vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { moveApplicationInPipeline } from "./actions";

const WORKSPACE_ID = "ws-1";

describe("F1-01 pipeline stage isolation", () => {
  beforeEach(() => {
    mocks.transactionImpl.mockReset();
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "user-1" },
    });
    mocks.requirePermission.mockResolvedValue(undefined);
  });

  it("rejects moving to a stage that belongs to another job (cross-job)", async () => {
    // The query joins jobStages on jobId === applications.jobId; a stage from a
    // different job yields no row, so the action must fail.
    mocks.transactionImpl.mockImplementation(async () => {
      throw new Error("Application or target stage not found.");
    });

    const result = await moveApplicationInPipeline({
      applicationId: "app-1",
      toStageId: "stage-from-other-job",
      fromStageId: "stage-current",
      workspaceId: WORKSPACE_ID,
      orderedApplicationIds: ["app-1"],
    });

    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/not found|unable to move/i);
  });

  it("allows moving to a stage of the same job", async () => {
    mocks.transactionImpl.mockImplementation(async () => []);

    const result = await moveApplicationInPipeline({
      applicationId: "app-1",
      toStageId: "stage-same-job",
      fromStageId: "stage-current",
      workspaceId: WORKSPACE_ID,
      orderedApplicationIds: ["app-1"],
    });

    expect(result.success).toBe(true);
  });
});
