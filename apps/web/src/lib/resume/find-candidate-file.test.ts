import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[], limit: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("@harly/db", () => {
  const builder: Record<string, unknown> = {
    from: () => builder,
    where: () => builder,
    limit: async (n: number) => {
      mocks.limit(n);
      return mocks.rows;
    },
  };
  return { db: { select: () => builder }, candidateFiles: {} };
});

import { findCandidateFileForKey } from "./find-candidate-file";

const KEY = "workspaces/ws-1/resumes/cand-1/cv.pdf";

describe("findCandidateFileForKey", () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.limit.mockClear();
  });

  it("returns the row whose stored URL resolves to exactly the key", async () => {
    mocks.rows = [
      { candidateId: "cand-1", fileUrl: `/uploads/${KEY}` },
    ];
    await expect(findCandidateFileForKey("ws-1", KEY)).resolves.toEqual({
      candidateId: "cand-1",
      fileUrl: `/uploads/${KEY}`,
    });
  });

  it("does not grant access on a mere suffix match of another key", async () => {
    // The SQL narrowing can return a row whose URL only ends with the key.
    mocks.rows = [
      {
        candidateId: "cand-2",
        fileUrl: `/uploads/workspaces/ws-1/resumes/other/${KEY.replace("workspaces/ws-1/resumes/", "")}`,
      },
    ];
    await expect(
      findCandidateFileForKey("ws-1", "resumes/cand-1/cv.pdf"),
    ).resolves.toBeNull();
  });

  it("narrows in SQL instead of scanning the workspace", async () => {
    await findCandidateFileForKey("ws-1", KEY);
    expect(mocks.limit).toHaveBeenCalledWith(20);
  });
});
