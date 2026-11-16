import { describe, expect, it, vi } from "vitest";

import {
  ConcurrencyConflictError,
  isTransactionAbort,
  withConcurrencyRetry,
} from "./concurrent";

function pgError(code: string) {
  return Object.assign(new Error(`postgres ${code}`), { code });
}

describe("isTransactionAbort", () => {
  it("recognizes deadlock and serialization aborts, also when wrapped", () => {
    expect(isTransactionAbort(pgError("40P01"))).toBe(true);
    expect(isTransactionAbort(pgError("40001"))).toBe(true);
    expect(isTransactionAbort(new Error("Failed query", { cause: pgError("40P01") }))).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isTransactionAbort(pgError("23505"))).toBe(false);
    expect(isTransactionAbort(new Error("boom"))).toBe(false);
    expect(isTransactionAbort(null)).toBe(false);
  });
});

describe("withConcurrencyRetry", () => {
  it("retries a transaction Postgres aborted as a deadlock victim", async () => {
    const attempt = vi
      .fn<(n: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error("Failed query", { cause: pgError("40P01") }))
      .mockResolvedValueOnce("moved");

    await expect(withConcurrencyRetry(attempt)).resolves.toBe("moved");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("still retries optimistic-concurrency conflicts", async () => {
    const attempt = vi
      .fn<(n: number) => Promise<string>>()
      .mockRejectedValueOnce(new ConcurrencyConflictError())
      .mockResolvedValueOnce("ok");

    await expect(withConcurrencyRetry(attempt)).resolves.toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors", async () => {
    const attempt = vi.fn<(n: number) => Promise<string>>().mockRejectedValue(pgError("23505"));

    await expect(withConcurrencyRetry(attempt)).rejects.toThrow("postgres 23505");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("gives up after the last attempt and reports it", async () => {
    const onExhausted = vi.fn();
    const attempt = vi.fn<(n: number) => Promise<string>>().mockRejectedValue(pgError("40P01"));

    await expect(withConcurrencyRetry(attempt, { onExhausted })).rejects.toThrow("postgres 40P01");
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(onExhausted).toHaveBeenCalledWith(expect.any(Error), 3);
  });

  it("uses the caller's conflict check when one is given", async () => {
    const attempt = vi.fn<(n: number) => Promise<string>>().mockRejectedValue(pgError("40P01"));

    await expect(withConcurrencyRetry(attempt, { isConflict: () => false })).rejects.toThrow();
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
