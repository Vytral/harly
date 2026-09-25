import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  getWorkspaceContext: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
}));
vi.mock("@harly/db", () => ({
  db: { select: mocks.select },
  applications: {},
  candidates: {},
  customRoles: {},
  jobs: {},
  jobHiringTeam: {},
  offers: {},
  interviews: {},
  member: {},
  user: {},
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));

import { requireCandidatePermission } from "./permissions-server";

const WORKSPACE_ID = "workspace-1";

function makeSelectReturning(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: async () => rows,
  };
  return builder;
}

describe("candidate permission scope without applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows owner access to a candidate with no applications", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "owner-1" },
      roleKey: "owner",
    });
    mocks.select.mockReturnValue(makeSelectReturning([]));

    await expect(
      requireCandidatePermission("candidates:view", "candidate-1"),
    ).resolves.toMatchObject({ organization: { id: WORKSPACE_ID } });
  });

  it("allows an admin/global candidates:view role to see a candidate with no applications", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "admin-1" },
      roleKey: "admin",
    });
    mocks.select
      .mockReturnValueOnce(
        makeSelectReturning([{ permissions: ["candidates:view"] }]),
      )
      .mockReturnValueOnce(
        makeSelectReturning([]),
      )
      .mockReturnValueOnce(
        makeSelectReturning([
          {
            permissions: ["candidates:view"],
            scope: { jobAccess: "all" },
          },
        ]),
      );

    await expect(
      requireCandidatePermission("candidates:view", "candidate-1"),
    ).resolves.toMatchObject({ organization: { id: WORKSPACE_ID } });
  });

  it("does not turn an assigned-only candidates:view role into global candidate access", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
      user: { id: "recruiter-1" },
      roleKey: "scoped-recruiter",
    });
    mocks.select
      .mockReturnValueOnce(
        makeSelectReturning([{ permissions: ["candidates:view"] }]),
      )
      .mockReturnValueOnce(
        makeSelectReturning([]),
      )
      .mockReturnValueOnce(
        makeSelectReturning([
          {
            permissions: ["candidates:view"],
            scope: { jobAccess: "assigned" },
          },
        ]),
      );

    await expect(
      requireCandidatePermission("candidates:view", "candidate-1"),
    ).rejects.toThrow(/not assigned to a job|access/i);
  });
});
