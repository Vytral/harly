import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  returnedClaim: null as { id: string } | null,
  updateSets: [] as unknown[],
}));

vi.mock("@harly/db", () => ({
  candidateDeletionJobs: {
    id: "id",
    status: "status",
    attempts: "attempts",
    workspaceId: "workspaceId",
    candidateId: "candidateId",
    dedupeKey: "dedupeKey",
    createdAt: "createdAt",
    nextRetryAt: "nextRetryAt",
    lockedAt: "lockedAt",
  },
  db: {
    update: () => ({
      set: (value: unknown) => {
        mocks.updateSets.push(value);
        return {
          where: () => ({
            returning: async () =>
              mocks.returnedClaim ? [mocks.returnedClaim] : [],
          }),
        };
      },
    }),
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  asc: (value: unknown) => value,
  eq: (...values: unknown[]) => values,
  inArray: (...values: unknown[]) => values,
  isNull: (value: unknown) => value,
  lte: (...values: unknown[]) => values,
  or: (...values: unknown[]) => values,
  sql: (...values: unknown[]) => values,
}));

import { startCandidateDeletionJob } from "./deletion-jobs";

beforeEach(() => {
  mocks.returnedClaim = { id: "job-1" };
  mocks.updateSets.length = 0;
});

describe("candidate deletion job claiming", () => {
  it("only treats a conditional status update as a successful claim", async () => {
    await expect(
      startCandidateDeletionJob("job-1", "worker-1"),
    ).resolves.toEqual({ id: "job-1" });
    expect(mocks.updateSets[0]).toEqual(
      expect.objectContaining({
        status: "processing",
        phase: "processing",
        lockedBy: "worker-1",
      }),
    );

    mocks.returnedClaim = null;
    await expect(
      startCandidateDeletionJob("job-1", "worker-2"),
    ).resolves.toBeNull();
  });
});
