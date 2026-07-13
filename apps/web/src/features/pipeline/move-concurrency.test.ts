import { beforeEach, describe, expect, it, vi } from "vitest";

// F1-08: drag-and-drop pipeline moves must be safe under concurrency. The move
// guards the candidate update with the row's `updatedAt` (optimistic locking):
// if another recruiter moved the same application first, the update affects 0
// rows and the whole move is rejected instead of silently clobbering state.

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
    select: vi.fn(() => ({
      from: () => ({
        leftJoin: () => ({ where: () => ({ limit: async () => [] }) }),
        where: () => ({ limit: async () => [] }),
      }),
    })),
  },
  applications: {
    id: "applications.id",
    jobId: "applications.jobId",
    workspaceId: "applications.workspaceId",
    currentStageId: "applications.currentStageId",
    updatedAt: "applications.updatedAt",
  },
  candidates: {},
  jobs: {},
  organization: {},
  jobStages: { name: "jobStages.name", emailConfig: "jobStages.emailConfig" },
  applicationStageHistory: {},
  activityEvents: {},
  emailTemplates: { id: "emailTemplates.id" },
  workspaceSettings: { primaryColor: "#000000" },
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
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

const APPLICATION_ROW = {
  id: "app-1",
  currentStageId: "stage-current",
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  status: "active",
  candidateEmail: "c@example.com",
  candidateFirstName: "Cand",
  candidateLastName: "Idate",
  jobTitle: "Engineer",
  workspaceName: "Acme",
  toStageName: "Interview",
  toStageEmailConfig: { candidateUpdatesEnabled: false },
};

function makeTx(firstUpdateRows: unknown[]) {
  const selectBuilder: Record<string, unknown> = {
    from: () => selectBuilder,
    innerJoin: () => selectBuilder,
    where: () => selectBuilder,
    limit: () => selectBuilder,
    then: (_resolve: (v: unknown) => void) => _resolve([APPLICATION_ROW]),
  };

  let updateCount = 0;
  const updateBuilder: Record<string, unknown> = {
    set: () => updateBuilder,
    where: () => updateBuilder,
    returning: async () => {
      updateCount += 1;
      return updateCount === 1 ? firstUpdateRows : [{ id: "x" }];
    },
  };

  const insertBuilder = {
    values: () => ({ then: (_resolve: (v: unknown) => void) => _resolve([]) }),
  };

  const tx = {
    select: () => selectBuilder,
    update: () => updateBuilder,
    insert: () => insertBuilder,
  };
  return { tx };
}

describe("F1-08 pipeline move concurrency guard", () => {
  beforeEach(() => {
    mocks.transactionImpl.mockReset();
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "user-1" },
    });
    mocks.requirePermission.mockResolvedValue(undefined);
  });

  it("rejects the move when the application was modified concurrently (optimistic lock)", async () => {
    // Simulate another recruiter having changed the row: the guarded update
    // matches 0 rows because `updatedAt` no longer matches.
    const { tx } = makeTx([]);
    mocks.transactionImpl.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    );

    const result = await moveApplicationInPipeline({
      applicationId: "app-1",
      toStageId: "stage-target",
      fromStageId: "stage-current",
      workspaceId: WORKSPACE_ID,
      orderedApplicationIds: ["app-1"],
    });

    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/changed by another recruiter|unable to move/i);
  });

  it("completes the move when no concurrent modification occurred", async () => {
    // The guarded update matches the row (updatedAt still matches) → proceeds.
    const { tx } = makeTx([{ id: "app-1" }]);
    mocks.transactionImpl.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    );

    const result = await moveApplicationInPipeline({
      applicationId: "app-1",
      toStageId: "stage-target",
      fromStageId: "stage-current",
      workspaceId: WORKSPACE_ID,
      orderedApplicationIds: ["app-1"],
    });

    expect(result.success).toBe(true);
  });
});
