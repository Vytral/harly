import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  list: vi.fn(),
  getRequestRateLimit: vi.fn(() => null),
}));

vi.mock("@/features/candidates/files-service", () => ({
  listCandidateFilesForApi: mocks.list,
}));
vi.mock("@/server/api/auth", () => ({
  authenticateApiKey: mocks.authenticate,
  getRequestRateLimit: mocks.getRequestRateLimit,
}));

import { GET } from "./route";

describe("GET /api/v1/candidates/:id/files", () => {
  const CANDIDATE_ID = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ workspaceId: "ws-1" });
  });

  it("requires files:read and returns safe service metadata", async () => {
    mocks.list.mockResolvedValue([
      {
        id: "file-1",
        fileName: "resume.pdf",
        fileType: "application/pdf",
        fileSize: 1234,
        createdAt: "2026-07-19T00:00:00.000Z",
      },
    ]);

    const response = await GET(
      new Request(
        `https://example.test/api/v1/candidates/${CANDIDATE_ID}/files`,
      ),
      { params: Promise.resolve({ id: CANDIDATE_ID }) },
    );

    expect(mocks.authenticate).toHaveBeenCalledWith(
      expect.any(Request),
      "files:read",
    );
    expect(mocks.list).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      candidateId: CANDIDATE_ID,
    });
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: "file-1",
          fileName: "resume.pdf",
          fileType: "application/pdf",
          fileSize: 1234,
          createdAt: "2026-07-19T00:00:00.000Z",
        },
      ],
    });
  });
});
