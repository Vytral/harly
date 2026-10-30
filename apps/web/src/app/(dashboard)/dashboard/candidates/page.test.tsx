import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePagePermission: vi.fn(),
  can: vi.fn(),
  getRolePolicy: vi.fn(),
  getWorkspaceContext: vi.fn(),
  listCandidateDirectory: vi.fn(),
  listCandidateDirectoryFacets: vi.fn(),
  listTrashedCandidates: vi.fn(),
  listEmailTemplates: vi.fn(),
  listJobOptions: vi.fn(),
  listWorkspaceMembers: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePagePermission: mocks.requirePagePermission,
  can: mocks.can,
  getRolePolicy: mocks.getRolePolicy,
}));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContext: mocks.getWorkspaceContext }));
vi.mock("@/features/candidates/data", () => ({
  listCandidateDirectory: mocks.listCandidateDirectory,
  listCandidateDirectoryFacets: mocks.listCandidateDirectoryFacets,
  listTrashedCandidates: mocks.listTrashedCandidates,
}));
vi.mock("@/features/email-templates/data", () => ({ listEmailTemplates: mocks.listEmailTemplates }));
vi.mock("@/features/jobs/data", () => ({ listJobOptions: mocks.listJobOptions }));
vi.mock("@/features/jobs/hiring-team-data", () => ({ listWorkspaceMembers: mocks.listWorkspaceMembers }));
vi.mock("@/lib/gravatar", () => ({ getWorkspaceGravatarEnabled: vi.fn(async () => false) }));
vi.mock("@/features/candidates/CandidatesTable", () => ({ CandidatesTable: () => null }));
vi.mock("@/features/candidates/import/ImportCandidatesDrawer", () => ({ ImportCandidatesDrawer: () => null }));
vi.mock("@/features/candidates/TrashCandidateActions", () => ({ TrashCandidateActions: () => null }));
vi.mock("@/features/candidates/AddCandidateDrawer", () => ({ AddCandidateDrawer: () => null }));

import CandidatesPage from "./page";

const UNRESTRICTED = { jobAccess: "all", departments: [], regions: [] };
const SCOPED = { jobAccess: "assigned", departments: [], regions: [] };

describe("candidates directory page: trash for job-limited roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceContext.mockResolvedValue({ organization: { id: "ws-1" }, user: { id: "user-1" }, roleKey: "recruiter" });
    mocks.can.mockResolvedValue(true);
    mocks.listCandidateDirectory.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 50 });
    mocks.listCandidateDirectoryFacets.mockResolvedValue({});
    mocks.listTrashedCandidates.mockResolvedValue([]);
    mocks.listEmailTemplates.mockResolvedValue([]);
    mocks.listJobOptions.mockResolvedValue([]);
    mocks.listWorkspaceMembers.mockResolvedValue([]);
  });

  it("does not load trashed candidates for a role limited to specific jobs", async () => {
    mocks.getRolePolicy.mockResolvedValue({ permissions: ["candidates:view"], scope: SCOPED });

    await CandidatesPage({ searchParams: Promise.resolve({ view: "trash" }) });

    expect(mocks.listTrashedCandidates).not.toHaveBeenCalled();
    expect(mocks.listCandidateDirectory).toHaveBeenCalled();
  });

  it("loads trashed candidates for an unrestricted role", async () => {
    mocks.getRolePolicy.mockResolvedValue({ permissions: ["candidates:view"], scope: UNRESTRICTED });

    await CandidatesPage({ searchParams: Promise.resolve({}) });

    expect(mocks.listTrashedCandidates).toHaveBeenCalledTimes(1);
  });
});
