import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({ sql: (...values: unknown[]) => values }));
vi.mock("@harly/db", () => ({ db: { execute: mocks.execute } }));

import { getEmailOutboxHealth, __resetEmailOutboxHealthCacheForTests } from "./outbox-health";

const COUNTS = [{ failed: 1, overdue: 2, stuck: 0 }];

describe("getEmailOutboxHealth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.execute.mockReset();
    __resetEmailOutboxHealthCacheForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves a readiness probe from a 15 second in-process cache instead of re-counting every time", async () => {
    mocks.execute.mockResolvedValue(COUNTS);

    await getEmailOutboxHealth();
    await getEmailOutboxHealth();
    expect(mocks.execute).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15_001);
    await getEmailOutboxHealth();
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed lookup, so the next probe tries again", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("connection reset"));
    mocks.execute.mockResolvedValueOnce(COUNTS);

    await expect(getEmailOutboxHealth()).rejects.toThrow("connection reset");
    const recovered = await getEmailOutboxHealth();

    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(recovered).toMatchObject({ failed: 1, overduePending: 2, stuckProcessing: 0 });
  });

  it("returns only instance-level counts and a status, never recipients or error text", async () => {
    mocks.execute.mockResolvedValue(COUNTS);

    const health = await getEmailOutboxHealth();

    expect(Object.keys(health).sort()).toEqual(["failed", "overduePending", "status", "stuckProcessing"]);
    expect(JSON.stringify(health)).not.toMatch(/@|payload|last_error/);
  });
});
