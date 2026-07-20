import { beforeEach, describe, expect, it, vi } from "vitest";

// Concurrency-retry coverage for the REST API application service. The
// `retryOnConflict` flag (default false) keeps the 409 contract intact for
// external clients, but when an internal caller opts in (e.g. the agent loop or
// a future batch mover) the move re-reads the fresh row and retries.

vi.mock("@/lib/auth", () => ({}));
vi.mock("@harly/auth", () => ({}));

const mocks = vi.hoisted(() => {
  let failures = 0;
  let hits = 0;
  return {
    reset: () => {
      failures = 0;
      hits = 0;
    },
    setFailures: (n: number) => {
      failures = n;
    },
    hit: () => {
      hits += 1;
      // The first `failures` update attempts match 0 rows (conflict);
      // every attempt after that succeeds.
      return hits <= failures ? [] : [{ id: "app-1" }];
    },
    transactionImpl: vi.fn(),
  };
});

vi.mock("@harly/api", () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "ApiError";
    }
    static conflict(message: string) {
      return new ApiError("conflict", message);
    }
    static unprocessable(message: string) {
      return new ApiError("unprocessable", message);
    }
  }
  return { ApiError };
});

vi.mock("@harly/db", () => {
  const applications = {
    id: "applications.id",
    jobId: "applications.jobId",
    workspaceId: "applications.workspaceId",
    currentStageId: "applications.currentStageId",
    updatedAt: "applications.updatedAt",
  };
  return {
    db: {
      transaction: (fn: (tx: unknown) => Promise<unknown>) =>
        mocks.transactionImpl(fn),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                id: "app-1",
                jobId: "job-1",
                workspaceId: "ws-1",
                currentStageId: "stage-current",
                status: "active",
                // Present so both the application row and the jobStage lookup
                // (which reads `.name`) resolve against this universal mock row.
                name: "Screening",
                updatedAt: new Date("2024-01-01T00:00:00.000Z"),
              },
            ],
          }),
        }),
      }),
    },
    applications,
    jobStages: { id: "jobStages.id", name: "jobStages.name" },
    applicationStageHistory: { id: "applicationStageHistory.id" },
  };
});

vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: vi.fn(),
}));
vi.mock("@/features/applications/notifications", () => ({
  notifyApplicationStatusChange: vi.fn(),
}));
vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: vi.fn(),
  processEmailOutbox: vi.fn(),
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(),
}));

import { moveApplicationStageForApi } from "./service";

describe("moveApplicationStageForApi concurrency retry", () => {
  beforeEach(() => {
    mocks.reset();
    mocks.transactionImpl.mockReset();
  });

  function makeTx() {
    const stageSelect: Record<string, unknown> = {
      from: () => stageSelect,
      where: () => stageSelect,
      limit: () => stageSelect,
      then: (_resolve: (v: unknown) => void) =>
        _resolve([{ id: "stage-target", name: "Screening" }]),
    };
    const updateBuilder: Record<string, unknown> = {
      set: () => updateBuilder,
      where: () => updateBuilder,
      returning: async () =>
        mocks.hit().map((row) => ({
          ...row,
          candidateId: "cand-1",
          jobId: "job-1",
          source: "applied",
          pipelineOrder: 1,
          appliedAt: new Date("2024-01-01T00:00:00.000Z"),
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          updatedAt: new Date("2024-01-02T00:00:00.000Z"),
          status: "active",
          currentStageId: "stage-target",
        })),
    };
    const insertBuilder = {
      values: () => ({ then: (_r: (v: unknown) => void) => _r([]) }),
    };
    return {
      tx: {
        select: () => stageSelect,
        update: () => updateBuilder,
        insert: () => insertBuilder,
      },
    };
  }

  it("does not retry when retryOnConflict is false and a conflict occurs (preserves 409 contract)", async () => {
    mocks.setFailures(99);
    const { tx } = makeTx();
    mocks.transactionImpl.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    );

    await expect(
      moveApplicationStageForApi({
        workspaceId: "ws-1",
        applicationId: "app-1",
        toStageId: "stage-target",
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    expect(mocks.transactionImpl).toHaveBeenCalledTimes(1);
  });

  it("retries silently and succeeds when retryOnConflict is true", async () => {
    mocks.setFailures(1);
    const { tx } = makeTx();
    mocks.transactionImpl.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    );

    const result = await moveApplicationStageForApi({
      workspaceId: "ws-1",
      applicationId: "app-1",
      toStageId: "stage-target",
      retryOnConflict: true,
    });

    expect(result.id).toBe("app-1");
    expect(mocks.transactionImpl).toHaveBeenCalledTimes(2);
  });

  it("surfaces the conflict after exhausting retries when retryOnConflict is true", async () => {
    mocks.setFailures(99);
    const { tx } = makeTx();
    mocks.transactionImpl.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    );

    await expect(
      moveApplicationStageForApi({
        workspaceId: "ws-1",
        applicationId: "app-1",
        toStageId: "stage-target",
        retryOnConflict: true,
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    expect(mocks.transactionImpl).toHaveBeenCalledTimes(3);
  });
});
