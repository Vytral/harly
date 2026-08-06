import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  getWorkspaceContextOrNull: vi.fn(),
  requireCandidatePermission: vi.fn(),
  readFile: vi.fn(),
  getLocalUploadPath: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("@harly/db", () => ({
  db: { select: mocks.select },
  candidateFiles: { workspaceId: "workspaceId", candidateId: "candidateId", fileUrl: "fileUrl" },
}));
vi.mock("@harly/storage", () => ({
  getLocalUploadPath: mocks.getLocalUploadPath,
}));
vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile,
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContextOrNull: mocks.getWorkspaceContextOrNull,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requireCandidatePermission: mocks.requireCandidatePermission,
}));

import { GET } from "./[...key]/route";
import { isPrivateResumeStorageKey } from "@/lib/upload-access";

function makeSelectReturning(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    where: () => builder,
    limit: async () => rows,
  };
  return builder;
}

describe("local upload serving", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCandidatePermission.mockResolvedValue(undefined);
    mocks.readFile.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    mocks.getLocalUploadPath.mockReturnValue("/tmp/candidate.pdf");
  });

  it("classifies resumes as private while leaving images public", () => {
    expect(isPrivateResumeStorageKey("workspaces/ws-1/resumes/cv.pdf")).toBe(true);
    expect(isPrivateResumeStorageKey("resumes/legacy/cv.pdf")).toBe(true);
    expect(isPrivateResumeStorageKey("workspaces/ws-1/images/avatar.png")).toBe(false);
  });

  it("does not serve a resume to an anonymous URL request", async () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue(null);

    const response = await GET(new Request("http://harly.test/uploads/cv.pdf"), {
      params: Promise.resolve({ key: ["workspaces", "ws-1", "resumes", "cv.pdf"] }),
    });

    expect(response.status).toBe(404);
  });

  it("does not serve a resume to a workspace member without candidate access", async () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "ws-1" },
    });
    mocks.select.mockReturnValue(
      makeSelectReturning([
        {
          candidateId: "candidate-1",
          fileUrl: "/uploads/workspaces/ws-1/resumes/cv.pdf",
        },
      ]),
    );
    mocks.requireCandidatePermission.mockRejectedValue(new Error("forbidden"));

    const response = await GET(new Request("http://harly.test/uploads/cv.pdf"), {
      params: Promise.resolve({ key: ["workspaces", "ws-1", "resumes", "cv.pdf"] }),
    });

    expect(response.status).toBe(404);
    expect(mocks.requireCandidatePermission).toHaveBeenCalledWith(
      "candidates:view",
      "candidate-1",
    );
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("resolves legacy keys to a workspace-owned candidate file before serving", async () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "ws-1" },
    });
    mocks.select.mockReturnValue(
      makeSelectReturning([
        {
          candidateId: "candidate-1",
          fileUrl: "/uploads/resumes/legacy/candidate-1/cv.pdf",
        },
      ]),
    );

    const response = await GET(new Request("http://harly.test/uploads/cv.pdf"), {
      params: Promise.resolve({
        key: ["resumes", "legacy", "candidate-1", "cv.pdf"],
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requireCandidatePermission).toHaveBeenCalledWith(
      "candidates:view",
      "candidate-1",
    );
    expect(mocks.readFile).toHaveBeenCalledWith("/tmp/candidate.pdf");
  });

  it("does not serve a legacy key that has no workspace-owned file record", async () => {
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "ws-1" },
    });
    mocks.select.mockReturnValue(makeSelectReturning([]));

    const response = await GET(new Request("http://harly.test/uploads/cv.pdf"), {
      params: Promise.resolve({
        key: ["resumes", "legacy", "candidate-1", "cv.pdf"],
      }),
    });

    expect(response.status).toBe(404);
    expect(mocks.requireCandidatePermission).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
});
