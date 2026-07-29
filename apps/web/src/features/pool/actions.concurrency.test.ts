import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  requirePermission: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {
    select: vi.fn(() => {
      const query: Record<string, unknown> = {
        then: (resolve: (value: unknown) => void) =>
          Promise.resolve(mocks.selectQueue.shift() ?? []).then(resolve),
        from: () => query,
        where: () => query,
        limit: () => query,
        orderBy: () => query,
      };
      return query;
    }),
    insert: mocks.insert,
  },
  applications: {},
  applicationStageHistory: {},
  candidates: {},
  jobs: {},
  jobStages: {},
  poolEntries: {},
}));

vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addToPoolAction } from "./actions";

describe("addToPoolAction concurrency handling", () => {
  beforeEach(() => {
    mocks.selectQueue = [];
    mocks.requirePermission.mockResolvedValue({
      user: { id: "user-1" },
      organization: { id: "workspace-1" },
    });
    mocks.insert.mockReset();
  });

  it("returns the shared message when the pre-check finds an active entry", async () => {
    mocks.selectQueue = [[{ id: "candidate-1" }], [{ id: "existing-entry" }]];

    const result = await addToPoolAction({
      candidateId: "11111111-1111-4111-8111-111111111111",
    });

    expect(result).toEqual({
      success: false,
      error: "Candidate is already in the pool.",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns the same message when a concurrent insert wins the unique index race", async () => {
    mocks.selectQueue = [[{ id: "candidate-1" }], []];
    mocks.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue({
        code: "23505",
        constraint_name: "pool_entries_active_workspace_candidate_idx",
      }),
    });

    const result = await addToPoolAction({
      candidateId: "11111111-1111-4111-8111-111111111111",
    });

    expect(result).toEqual({
      success: false,
      error: "Candidate is already in the pool.",
    });
  });
});
