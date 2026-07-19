import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  selectCalls: 0,
  insert: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  lt: vi.fn(),
  or: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {
    select: vi.fn(() => {
      const result = mocks.selectResults[mocks.selectCalls++] ?? [];
      const query: Record<string, unknown> = {
        then: (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve),
        from: () => query,
        where: () => query,
        limit: () => query,
        orderBy: () => query,
      };
      return query;
    }),
    insert: mocks.insert,
  },
  candidates: {},
  jobs: {},
  member: {},
  poolEntries: {},
}));

vi.mock("@harly/api", () => ({
  ApiError: {
    conflict: (message: string) => Object.assign(new Error(message), { code: "conflict" }),
    notFound: (message: string) => Object.assign(new Error(message), { code: "not_found" }),
    unprocessable: (message: string) =>
      Object.assign(new Error(message), { code: "unprocessable" }),
  },
}));

vi.mock("@/features/applications/service", () => ({
  createApplicationForApi: vi.fn(),
}));

import { addPoolEntryForApi } from "./service";

const input = {
  workspaceId: "workspace-1",
  actorId: "user-1",
  values: {
    candidateId: "11111111-1111-4111-8111-111111111111",
  },
};

describe("addPoolEntryForApi concurrency handling", () => {
  beforeEach(() => {
    mocks.selectCalls = 0;
    mocks.selectResults = [];
    mocks.insert.mockReset();
  });

  it("uses the shared message when the pre-check finds an active entry", async () => {
    mocks.selectResults = [
      [{ userId: "user-1" }],
      [{ id: input.values.candidateId }],
      [{ id: "active-entry" }],
    ];

    await expect(addPoolEntryForApi(input)).rejects.toMatchObject({
      code: "conflict",
      message: "Candidate is already in the pool.",
    });
  });

  it("uses the same message when the unique index rejects a concurrent insert", async () => {
    mocks.selectResults = [
      [{ userId: "user-1" }],
      [{ id: input.values.candidateId }],
      [],
      [],
    ];
    mocks.insert.mockReturnValue({
      values: () => ({
        returning: vi.fn().mockRejectedValue({
          code: "23505",
          constraint_name: "pool_entries_active_workspace_candidate_idx",
        }),
      }),
    });

    await expect(addPoolEntryForApi(input)).rejects.toMatchObject({
      code: "conflict",
      message: "Candidate is already in the pool.",
    });
  });
});
