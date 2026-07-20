import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn(),
  insertConflictUpdate: vi.fn(),
  updateSet: vi.fn(),
  selectResult: [] as unknown[],
}));

function query<T>(value: T) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = () => chain;
  chain.for = () => chain;
  chain.then = (resolve: (value: T) => unknown) =>
    Promise.resolve(value).then(resolve);
  return chain;
}

function update() {
  return {
    set: (value: unknown) => {
      mocks.updateSet(value);
      return { where: async () => undefined };
    },
  };
}

vi.mock("@harly/db", () => ({
  interviewSyncs: {
    workspaceId: "workspaceId",
    interviewId: "interviewId",
    provider: "provider",
    attempts: "attempts",
    status: "status",
    nextRetryAt: "nextRetryAt",
  },
  db: {
    insert: () => ({
      values: (value: unknown) => {
        mocks.insertValues(value);
        return {
          onConflictDoUpdate: (config: unknown) => {
            mocks.insertConflictUpdate(config);
            return Promise.resolve();
          },
        };
      },
    }),
    select: () => query(mocks.selectResult),
    update,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ select: () => query(mocks.selectResult), update }),
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
  inArray: (...values: unknown[]) => values,
  isNull: (value: unknown) => value,
  lte: (...values: unknown[]) => values,
  or: (...values: unknown[]) => values,
  sql: (...values: unknown[]) => values,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { trackInterviewSync } from "./sync-ledger";

beforeEach(() => {
  mocks.insertValues.mockReset();
  mocks.insertConflictUpdate.mockReset();
  mocks.updateSet.mockReset();
  mocks.selectResult.length = 0;
  mocks.selectResult.push({ attempts: 2 });
});

const baseInput = {
  workspaceId: "ws-1",
  interviewId: "iv-1",
  provider: "zoom" as const,
  operation: "upsert" as const,
};

describe("interview sync ledger", () => {
  it("records a successful provider mutation and its resource", async () => {
    const result = await trackInterviewSync({
      ...baseInput,
      run: async () => ({ meetingId: "zoom-1", joinUrl: "https://zoom.us/1" }),
      isSuccess: Boolean,
      resourceId: (value) => value.meetingId,
      resourceUrl: (value) => value.joinUrl,
    });

    expect(result.meetingId).toBe("zoom-1");
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        interviewId: "iv-1",
        provider: "zoom",
        operation: "upsert",
        status: "pending",
        attempts: 1,
      }),
    );
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "synced",
        providerResourceId: "zoom-1",
        providerUrl: "https://zoom.us/1",
        lastError: null,
      }),
    );
  });

  it("marks a false provider result failed with exponential retry time", async () => {
    const result = await trackInterviewSync({
      ...baseInput,
      run: async () => null,
      isSuccess: Boolean,
    });

    expect(result).toBeNull();
    const update = mocks.updateSet.mock.calls[0]?.[0] as {
      status: string;
      lastError: string;
      nextRetryAt: Date;
    };
    expect(update.status).toBe("failed");
    expect(update.lastError).toMatch(/did not complete/i);
    expect(update.nextRetryAt).toBeInstanceOf(Date);
    expect(update.nextRetryAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("records thrown provider errors without reclassifying them", async () => {
    await expect(
      trackInterviewSync({
        ...baseInput,
        run: async () => {
          throw new Error("provider timeout");
        },
        isSuccess: Boolean,
      }),
    ).rejects.toThrow("provider timeout");

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        lastError: "provider timeout",
      }),
    );
  });

  it("claims due rows with an expiring worker lock", async () => {
    mocks.selectResult.length = 0;
    mocks.selectResult.push({
      id: "sync-1",
      workspaceId: "ws-1",
      interviewId: "iv-1",
      provider: "zoom",
      status: "failed",
    });

    const { claimDueInterviewSyncs } = await import("./sync-ledger");
    const rows = await claimDueInterviewSyncs({
      workerId: "worker-1",
      limit: 10,
    });

    expect(rows).toHaveLength(1);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ lockedBy: "worker-1", lockedAt: expect.any(Date) }),
    );
  });
});
