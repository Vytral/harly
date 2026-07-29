import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: mocks,
  mailIdempotencyKeys: {
    id: "id",
    workspaceId: "workspaceId",
    status: "status",
    updatedAt: "updatedAt",
    error: "error",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
  lt: (...values: unknown[]) => values,
  or: (...values: unknown[]) => values,
}));

import { reconcileMailDeliveries } from "./reconciliation";

function selectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => rows,
  };
  return chain;
}

function updateChain(rows: unknown[]) {
  return {
    set: () => ({
      where: () => ({ returning: async () => rows }),
    }),
  };
}

describe("mail delivery reconciliation", () => {
  beforeEach(() => {
    mocks.select.mockReset();
    mocks.update.mockReset();
  });

  it("reports stale and unknown deliveries without mutating in dry-run", async () => {
    const rows = [
      {
        id: "stale-1",
        workspaceId: "workspace-a",
        status: "sending",
        updatedAt: new Date(Date.now() - 120_000),
        error: null,
      },
      {
        id: "unknown-1",
        workspaceId: "workspace-b",
        status: "unknown",
        updatedAt: new Date(Date.now() - 240_000),
        error: "provider timeout",
      },
    ];
    mocks.select.mockReturnValue(selectChain(rows));

    await expect(
      reconcileMailDeliveries({ dryRun: true, staleAfterMs: 60_000 }),
    ).resolves.toMatchObject({
      dryRun: true,
      inspected: 2,
      staleSending: 1,
      unknown: 1,
      normalized: 0,
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("normalizes stale sends but leaves unknown outcomes for an operator", async () => {
    const rows = [
      {
        id: "stale-1",
        workspaceId: "workspace-a",
        status: "sending",
        updatedAt: new Date(Date.now() - 120_000),
        error: null,
      },
      {
        id: "unknown-1",
        workspaceId: "workspace-b",
        status: "unknown",
        updatedAt: new Date(Date.now() - 240_000),
        error: "provider timeout",
      },
    ];
    mocks.select.mockReturnValue(selectChain(rows));
    mocks.update.mockReturnValue(updateChain([{ id: "stale-1" }]));

    const result = await reconcileMailDeliveries({
      dryRun: false,
      staleAfterMs: 60_000,
    });

    expect(result.normalized).toBe(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
});
