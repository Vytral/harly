import { describe, expect, it, vi } from "vitest";

import { retryOnTransactionAbort } from "./stage-lifecycle";

function pgError(code: string, wrapped = false) {
  const driver = Object.assign(new Error("deadlock detected"), { code });
  return wrapped ? Object.assign(new Error("Failed query"), { cause: driver }) : driver;
}

describe("retryOnTransactionAbort", () => {
  it("retries a transaction Postgres aborted for a deadlock, then returns its result", async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(pgError("40P01", true))
      .mockRejectedValueOnce(pgError("40001"))
      .mockResolvedValueOnce("archived");

    await expect(retryOnTransactionAbort(run, { baseDelayMs: 0 })).resolves.toBe("archived");
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("answers 409 asking the caller to retry once the attempts are exhausted", async () => {
    const run = vi.fn(async () => {
      throw pgError("40P01");
    });

    await expect(retryOnTransactionAbort(run, { attempts: 3, baseDelayMs: 0 })).rejects.toMatchObject({
      code: "conflict",
      message: expect.stringMatching(/busy.*retry/i),
    });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("does not retry errors that are not transaction aborts", async () => {
    const run = vi.fn(async () => {
      throw new Error("Stage could not be archived.");
    });

    await expect(retryOnTransactionAbort(run, { baseDelayMs: 0 })).rejects.toThrow(
      "Stage could not be archived.",
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not retry a unique violation", async () => {
    const run = vi.fn(async () => {
      throw pgError("23505");
    });

    await expect(retryOnTransactionAbort(run, { baseDelayMs: 0 })).rejects.toMatchObject({ code: "23505" });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
