import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  lockResult: true,
  queries: [] as string[],
  release: vi.fn(),
  scopes: [] as string[],
}));

vi.mock("@harly/db", () => ({
  // The app pool must never be reserved for a lock: fail loudly if it is.
  sql: {
    reserve: async () => {
      throw new Error("cron locks must not reserve from the app pool");
    },
  },
  advisoryLockSql: (scope: string) => ({
    scope,
    reserve: async () => {
      state.scopes.push(scope);
      const connection = async (strings: TemplateStringsArray) => {
        state.queries.push(strings.join(" "));
        return [{ locked: state.lockResult }];
      };
      connection.release = state.release;
      return connection;
    },
  }),
}));

vi.mock("@/lib/logger", () => ({
  getServerLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { NextRequest } from "next/server";
import { authorizeCron } from "./cron-auth";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/cron/test", { headers });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-secret");
  state.lockResult = true;
  state.queries.length = 0;
  state.release.mockReset();
  state.scopes.length = 0;
});

describe("authorizeCron", () => {
  it("rejects missing or invalid bearer credentials", async () => {
    await expect(authorizeCron(request(), "test")).resolves.toMatchObject({
      ok: false,
      response: expect.objectContaining({ status: 401 }),
    });
    await expect(
      authorizeCron(
        request({ authorization: "Bearer wrong" }),
        "test",
      ),
    ).resolves.toMatchObject({
      ok: false,
      response: expect.objectContaining({ status: 401 }),
    });
    await expect(
      authorizeCron(
        request({ authorization: "Bearer cron-secret" }),
        "test",
      ),
    ).resolves.toMatchObject({ ok: true });
  });

  it("rejects a second concurrent execution for the same cron key", async () => {
    state.lockResult = false;
    const result = await authorizeCron(
      request({ authorization: "Bearer cron-secret" }),
      "candidate-deletions",
    );
    expect(result).toMatchObject({
      ok: false,
      response: expect.objectContaining({ status: 409 }),
    });
    expect(state.release).toHaveBeenCalledOnce();
  });

  it("holds and releases the database advisory lock", async () => {
    const result = await authorizeCron(
      request({ authorization: "Bearer cron-secret" }),
      "candidate-deletions",
    );
    expect(result).toMatchObject({ ok: true });
    if (result.ok) await result.release();
    expect(state.queries).toHaveLength(2);
    expect(state.release).toHaveBeenCalledOnce();
    // Cron locks live in their own scope, apart from the nested mailbox lock.
    expect(state.scopes).toEqual(["cron"]);
  });

  it("fails closed when the cron secret is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    await expect(authorizeCron(request(), "test")).resolves.toMatchObject({
      ok: false,
      response: expect.objectContaining({ status: 503 }),
    });
  });
});
