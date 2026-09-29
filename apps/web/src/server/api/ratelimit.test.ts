import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@harly/api";

const mocks = vi.hoisted(() => ({ returning: vi.fn() }));

vi.mock("@harly/db", () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({ returning: mocks.returning }),
      }),
    }),
  },
  rateLimitBuckets: {},
}));

import {
  DatabaseStore,
  MemoryStore,
  enforceRateLimit,
  rateLimitResultFromError,
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

  it("attaches quota state to an exhausted-budget error", async () => {
    const store = new MemoryStore();
    await store.consume("exhausted", 1, 60_000);

    let caught: unknown;
    try {
      await store.consume("exhausted", 1, 60_000);
    } catch (error) {
      caught = error;
    }

    expect(rateLimitResultFromError(caught)).toMatchObject({
      limit: 1,
      remaining: 0,
    });
  });
});

describe("enforceRateLimit pluggable store", () => {
  it("delegates to the provided store", async () => {
    const store = {
      consume: vi.fn(async () => ({ limit: 10, remaining: 9, resetAt: 0 })),
    };
    await enforceRateLimit("k", { limit: 10, windowMs: 1000 }, store as never);
    expect(store.consume).toHaveBeenCalledWith("k", 10, 1000);
  });
});

describe("DatabaseStore rate limiting (shared, multi-instance)", () => {
  // The atomic upsert itself is covered against Postgres in
  // ratelimit.database.integration.test.ts; this checks the admit/reject logic.
  it("admits a hit while the upserted count is within the limit", async () => {
    mocks.returning.mockResolvedValue([{ count: 1, resetAt: new Date(Date.now() + 60_000) }]);
    const result = await new DatabaseStore().consume("db-key", 5, 60_000);
    expect(result.remaining).toBe(4);
  });

  it("admits the last slot exactly at the limit", async () => {
    mocks.returning.mockResolvedValue([{ count: 5, resetAt: new Date(Date.now() + 60_000) }]);
    await expect(new DatabaseStore().consume("db-key", 5, 60_000)).resolves.toMatchObject({
      remaining: 0,
    });
  });

  it("rejects once the upserted count passes the limit", async () => {
    mocks.returning.mockResolvedValue([{ count: 6, resetAt: new Date(Date.now() + 60_000) }]);
    await expect(
      new DatabaseStore().consume("db-key", 5, 60_000),
    ).rejects.toThrow(ApiError);
  });
});
