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
    requireApplicationPermission: vi.fn(),
    emitWebhookEvent: vi.fn(),
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
  requireApplicationPermission: mocks.requirePermission,
}));
vi.mock("@/lib/email", () => ({
  sendWorkspaceEmail: vi.fn(),
  getWorkspaceEmailBranding: vi.fn(async () => ({})),
}));
vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: mocks.emitWebhookEvent,
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

// Simulate `failures` consecutive guarded-update misses (optimistic lock
// conflicts) before the move finally succeeds. Fresh row read each attempt.
function makeTxWithFailures(failures: number) {
  let attempt = 0;
  const selectBuilder: Record<string, unknown> = {
    from: () => selectBuilder,
    innerJoin: () => selectBuilder,
    where: () => selectBuilder,
    limit: () => selectBuilder,
    then: (_resolve: (v: unknown) => void) => {
      // Each read returns the row with a *current* updatedAt, proving the
      // retry re-reads fresh state instead of reusing the first snapshot.
      attempt += 1;
      const fresh = {
        ...APPLICATION_ROW,
        updatedAt: new Date(`2024-01-0${attempt}T00:00:00.000Z`),
      };
      _resolve([fresh]);
    },
  };

  let updateCount = 0;
  const updateBuilder: Record<string, unknown> = {
    set: () => updateBuilder,
    where: () => updateBuilder,
    returning: async () => {
      updateCount += 1;
      // First `failures` updates miss (0 rows); the next one succeeds.
      return updateCount <= failures ? [] : [{ id: "app-1" }];
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
    mocks.emitWebhookEvent.mockReset();
  });

  it("rejects the move when the application stays modified concurrently (optimistic lock)", async () => {
    // Persistent conflict: every guarded update matches 0 rows. The retry runs
    // up to maxAttempts and then surfaces the real failure.
    const { tx } = makeTxWithFailures(99);
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
    expect(result.error ?? "").toMatch(/changed by another recruiter/i);
    expect(mocks.transactionImpl).toHaveBeenCalledTimes(3);
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

  it("silently retries after a transient optimistic-lock conflict and succeeds on the next attempt", async () => {
    // One conflict (another action touched the row), then the retry re-reads
    // the fresh row and the move succeeds. Confirms no stale data leaks across
    // attempts and exactly 2 transactions run.
    const { tx } = makeTxWithFailures(1);
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
    expect(mocks.transactionImpl).toHaveBeenCalledTimes(2);
    expect(mocks.emitWebhookEvent).toHaveBeenCalledTimes(1);
    const [workspaceId, eventName, payload, options] =
      mocks.emitWebhookEvent.mock.calls[0] ?? [];
    expect(workspaceId).toBe(WORKSPACE_ID);
    expect(eventName).toBe("application.stage_changed");
    expect(payload).toMatchObject({
      application: { id: "app-1" },
      eventId: expect.any(String),
    });
    expect(options).toMatchObject({
      actorId: "user-1",
      eventId: payload.eventId,
      skipDomainEvent: true,
    });
  });

  it("surfaces the real error after exhausting all retries instead of hanging", async () => {
    // Three consecutive conflicts (maxAttempts = 3) → the action must return
    // failure with the real message, not hang or loop forever.
    const { tx } = makeTxWithFailures(99);
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
    expect(result.error ?? "").toMatch(/changed by another recruiter/i);
    expect(mocks.transactionImpl).toHaveBeenCalledTimes(3);
  });
});
