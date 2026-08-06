import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRolePolicy: vi.fn(),
  requirePermission: vi.fn(),
  searchWorkspace: vi.fn(),
}));

vi.mock("@/features/workspaces/permissions-server", () => ({
  getRolePolicy: mocks.getRolePolicy,
  requirePermission: mocks.requirePermission,
}));
vi.mock("./data", () => ({
  emptySearchResults: { jobs: [], candidates: [] },
  searchWorkspace: mocks.searchWorkspace,
}));

import { searchWorkspaceAction } from "./actions";

describe("workspace search authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({
      organization: { id: "ws-1" },
      roleKey: "recruiter",
    });
    mocks.getRolePolicy.mockResolvedValue({
      scope: { jobAccess: "all", departments: [], regions: [] },
    });
    mocks.searchWorkspace.mockResolvedValue({ jobs: [], candidates: [] });
  });

  it("requires candidate visibility before searching PII-bearing results", async () => {
    await expect(searchWorkspaceAction("Ada")).resolves.toEqual({
      jobs: [],
      candidates: [],
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith("candidates:view");
    expect(mocks.getRolePolicy).toHaveBeenCalledWith("ws-1", "recruiter");
    expect(mocks.searchWorkspace).toHaveBeenCalledWith("Ada");
  });

  it("does not query when the caller lacks candidate visibility", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("forbidden"));

    await expect(searchWorkspaceAction("Ada")).rejects.toThrow("forbidden");
    expect(mocks.searchWorkspace).not.toHaveBeenCalled();
  });

  it("does not expose workspace-wide candidate search to scoped roles", async () => {
    mocks.getRolePolicy.mockResolvedValue({
      scope: { jobAccess: "assigned", departments: [], regions: [] },
    });

    await expect(searchWorkspaceAction("Ada")).rejects.toThrow(
      "scoped roles",
    );
    expect(mocks.searchWorkspace).not.toHaveBeenCalled();
  });
});
