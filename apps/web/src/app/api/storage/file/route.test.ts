import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  getWorkspaceContextOrNull: vi.fn(),
  requireCandidatePermission: vi.fn(),
  read: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: { select: mocks.select },
  candidateFiles: {},
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContextOrNull: mocks.getWorkspaceContextOrNull,
}));

vi.mock("@/features/workspaces/permissions-server", () => ({
  requireCandidatePermission: mocks.requireCandidatePermission,
}));

vi.mock("@/lib/storage", () => ({
  storage: { read: mocks.read },
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/lib/portal-auth", () => ({
  PORTAL_SESSION_COOKIE: "portal-session",
  resolvePortalSession: vi.fn(),
}));

import { GET } from "./route";

const WORKSPACE_ID = "workspace-1";
const RESUME_KEY = "workspaces/workspace-1/resumes/candidate-1/resume.pdf";
const LEGACY_RESUME_KEY = "resumes/legacy/candidate-1/resume.pdf";

function makeSelectReturning(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    where: () => builder,
    limit: async () => rows,
  };
  return builder;
}

function request(key = RESUME_KEY) {
  return new NextRequest(
    `http://harly.test/api/storage/file?key=${encodeURIComponent(key)}`,
  );
}

describe("private resume route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "recruiter-1" },
    });
    mocks.cookies.mockResolvedValue({ get: () => undefined });
    mocks.select.mockReturnValue(
      makeSelectReturning([
        {
          candidateId: "candidate-1",
          fileUrl: `/api/storage/file?key=${encodeURIComponent(RESUME_KEY)}`,
        },
      ]),
    );
    mocks.requireCandidatePermission.mockResolvedValue(undefined);
    mocks.read.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  });

  it("denies a same-workspace CV when the recruiter lacks candidate/job scope", async () => {
    mocks.requireCandidatePermission.mockRejectedValue(
      new Error("You are not assigned to this job."),
    );

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mocks.requireCandidatePermission).toHaveBeenCalledWith(
      "candidates:view",
      "candidate-1",
    );
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("serves a CV after candidate:view and job-scope authorization succeeds", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.requireCandidatePermission).toHaveBeenCalledWith(
      "candidates:view",
      "candidate-1",
    );
    expect(mocks.read).toHaveBeenCalledWith(RESUME_KEY);
    await expect(response.arrayBuffer()).resolves.toEqual(
      new Uint8Array([37, 80, 68, 70]).buffer,
    );
  });

  it("matches a canonical key to an absolute legacy upload URL instead of comparing URLs literally", async () => {
    mocks.select.mockReturnValue(
      makeSelectReturning([
        {
          candidateId: "candidate-1",
          fileUrl: `https://cdn.example.test/uploads/${RESUME_KEY}`,
        },
      ]),
    );

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.requireCandidatePermission).toHaveBeenCalledWith(
      "candidates:view",
      "candidate-1",
    );
    expect(mocks.read).toHaveBeenCalledWith(RESUME_KEY);
  });

  it("resolves a legacy unscoped resume key within the current workspace", async () => {
    mocks.select.mockReturnValue(
      makeSelectReturning([
        {
          candidateId: "candidate-1",
          fileUrl: "/uploads/resumes/legacy/candidate-1/resume.pdf",
        },
      ]),
    );

    const response = await GET(request(LEGACY_RESUME_KEY));

    expect(response.status).toBe(200);
    expect(mocks.requireCandidatePermission).toHaveBeenCalledWith(
      "candidates:view",
      "candidate-1",
    );
    expect(mocks.read).toHaveBeenCalledWith(LEGACY_RESUME_KEY);
  });
});
