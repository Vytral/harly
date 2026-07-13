import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@harly/api";

const mocks = vi.hoisted(() => ({ transactionImpl: vi.fn() }));

vi.mock("@harly/db", () => ({
  db: {
    transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mocks.transactionImpl(fn),
  },
  rateLimitBuckets: {},
}));

import {
  DatabaseStore,
  MemoryStore,
  enforceRateLimit,
} from "@/server/api/ratelimit";

describe("MemoryStore rate limiting", () => {
  it("allows up to the limit then rejects the next call", async () => {
    const store = new MemoryStore();
    const key = `mem-${Math.random()}`;
    const r1 = await store.consume(key, 3, 60_000);
    const r2 = await store.consume(key, 3, 60_000);
    const r3 = await store.consume(key, 3, 60_000);
    expect([r1.remaining, r2.remaining, r3.remaining]).toEqual([2, 1, 0]);
    await expect(store.consume(key, 3, 60_000)).rejects.toThrow(ApiError);
  });
});

describe("enforceRateLimit pluggable store", () => {
  it("delegates to the provided store", async () => {
    const store = { consume: vi.fn(async () => ({ remaining: 9, resetAt: 0 })) };
    await enforceRateLimit("k", { limit: 10, windowMs: 1000 }, store as never);
    expect(store.consume).toHaveBeenCalledWith("k", 10, 1000);
  });
});

describe("DatabaseStore rate limiting (shared, multi-instance)", () => {
  function makeTx(initialRow: unknown[] | null) {
    return {
      select: () => ({
        from: () => ({
          where: () => ({
            for: () => ({ limit: async () => initialRow }),
          }),
        }),
      }),
      insert: () => ({
        values: () => ({ onConflictDoUpdate: async () => ({}) }),
      }),
      update: () => ({ set: () => ({ where: async () => ({}) }) }),
    };
  }

  it("creates a fresh bucket when none exists and allows the request", async () => {
    mocks.transactionImpl.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx([])),
    );
    const result = await new DatabaseStore().consume("db-key", 5, 60_000);
    expect(result.remaining).toBe(4);
  });

  it("rejects when the shared bucket is already exhausted", async () => {
    const row = { count: 5, resetAt: new Date(Date.now() + 60_000) };
    mocks.transactionImpl.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx([row])),
    );
    await expect(new DatabaseStore().consume("db-key", 5, 60_000)).rejects.toThrow(
      ApiError,
    );
  });
});
