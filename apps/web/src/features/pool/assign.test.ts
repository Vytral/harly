import { beforeEach, describe, expect, it, vi } from "vitest";

// F1-09: a candidate from the talent pool must only be assigned to an OPEN job.
// Draft/closed jobs are rejected, and the application + stage history are created
// inside a single transaction with an idempotent (onConflictDoNothing) insert.

const mocks = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const transactionImpl = vi.fn();
  return {
    selectQueue,
    transactionImpl,
    requirePermission: vi.fn(),
    insertResults: [] as unknown[][],
  };
});

vi.mock("@harly/db", () => {
  const makeQuery = () => {
    const q: Record<string, unknown> = {};
    // Awaiting the builder (with or without a trailing .limit()) resolves to the
    // next queued result, mirroring drizzle's query execution.
    q.then = (resolve: (v: unknown) => void) =>
      Promise.resolve(mocks.selectQueue.shift() ?? []).then(resolve);
    q.from = () => q;
    q.where = () => q;
    q.innerJoin = () => q;
    q.leftJoin = () => q;
    q.orderBy = () => q;
    q.limit = () => q;
    return q;
  };
  return {
    db: {
      select: vi.fn(makeQuery),
      insert: vi.fn(() => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => mocks.insertResults.shift() ?? [{ id: "app-1" }],
          }),
          returning: async () => mocks.insertResults.shift() ?? [{ id: "app-1" }],
        }),
      })),
      transaction: (fn: (tx: unknown) => Promise<unknown>) =>
        mocks.transactionImpl(fn),
    },
    poolEntries: {},
    candidates: {},
    jobs: {},
    jobStages: {},
    applications: {},
    applicationStageHistory: {},
  };
});

vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { assignFromPoolToJobAction } from "./actions";

describe("F1-09 talent pool assignment", () => {
  beforeEach(() => {
    mocks.selectQueue.length = 0;
    mocks.insertResults.length = 0;
    mocks.transactionImpl.mockReset();
    mocks.requirePermission.mockResolvedValue({
      user: { id: "user-1" },
      organization: { id: "ws-1" },
    });
    // Default success chain (assignFromPoolToJobAction has no pool check):
    // candidate exists, open job, no duplicate application, first stage present,
    // next order = 1.
    mocks.selectQueue.push(
      [{ id: "11111111-1111-4111-8111-111111111111" }], // candidate
      [{ id: "22222222-2222-4222-8222-222222222222", status: "open" }], // job
      [], // duplicate application
      [{ id: "stage-1" }], // first stage
      [{ value: 1 }], // next order
    );
    mocks.transactionImpl.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({ returning: async () => [{ id: "app-1" }] }),
            returning: async () => [{ id: "app-1" }],
          }),
        }),
        update: () => ({ set: () => ({ where: () => ({}) }) }),
      };
      return fn(tx);
    });
  });

  it("rejects assignment to a closed job", async () => {
    mocks.selectQueue.length = 0;
    // The job check filters by `status = 'open'` in its WHERE clause, so a closed
    // job yields no row and the action reports it as not open.
    mocks.selectQueue.push(
      [{ id: "11111111-1111-4111-8111-111111111111" }],
      [],
    );

    const result = await assignFromPoolToJobAction({
      candidateId: "11111111-1111-4111-8111-111111111111",
      jobId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not open/i);
  });

  it("rejects assignment to a draft job", async () => {
    mocks.selectQueue.length = 0;
    mocks.selectQueue.push(
      [{ id: "11111111-1111-4111-8111-111111111111" }],
      [],
    );

    const result = await assignFromPoolToJobAction({
      candidateId: "11111111-1111-4111-8111-111111111111",
      jobId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not open/i);
  });

  it("creates the application + stage history in a single transaction for an open job", async () => {
    const result = await assignFromPoolToJobAction({
      candidateId: "11111111-1111-4111-8111-111111111111",
      jobId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result.success).toBe(true);
    expect(mocks.transactionImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a duplicate application for the same job", async () => {
    mocks.selectQueue.length = 0;
    mocks.selectQueue.push(
      [{ id: "11111111-1111-4111-8111-111111111111" }],
      [{ id: "22222222-2222-4222-8222-222222222222", status: "open" }],
      [{ id: "existing-app" }], // duplicate application present
    );

    const result = await assignFromPoolToJobAction({
      candidateId: "11111111-1111-4111-8111-111111111111",
      jobId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already has an application/i);
  });
});
